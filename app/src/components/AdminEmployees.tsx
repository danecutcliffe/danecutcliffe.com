import { useEffect, useState } from 'react';
import { Archive, ChevronDown, ChevronUp, ExternalLink, MapPin, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { AppRole, JobCode, JobSite, PayPeriodSettings, PayrollGrossUpMultiplier, Profile, TimeEntry, WorkerType } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import type { AdminTimeClockService } from '../services/TimeClockService';
import { geocodeAddress } from '../utils/geocoding';
import { googleMapsCoordinatesUrl, googleMapsSearchUrl, isJobCodeUsed, jobPropertyName, jobSiteById } from '../utils/jobs';
import type { ThemePreference } from '../utils/theme';
import { formatAtlanticDate, getAtlanticDateKey } from '../utils/time';
import { ThemePreferenceControl } from './ThemePreferenceControl';

interface AdminEmployeesProps {
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  payPeriodSettings: PayPeriodSettings;
  grossUpMultipliers: PayrollGrossUpMultiplier[];
  currentProfileId: string;
  service: AdminTimeClockService;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onPayPeriodSettingsChange: (settings: PayPeriodSettings, adminPassword: string) => Promise<void>;
  onGrossUpMultiplierSave: (effectiveDate: string, multiplier: number, adminPassword: string) => Promise<void>;
  onGrossUpMultiplierDelete: (id: string, adminPassword: string) => Promise<void>;
  onDataChange: () => Promise<void>;
}

export function AdminEmployees({ profiles, jobSites, jobCodes, entries, payPeriodSettings, grossUpMultipliers, currentProfileId, service, themePreference, onThemePreferenceChange, onPayPeriodSettingsChange, onGrossUpMultiplierSave, onGrossUpMultiplierDelete, onDataChange }: AdminEmployeesProps) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [archivedJobCodesOpen, setArchivedJobCodesOpen] = useState(false);
  const workingSites = jobSites.filter((site) => !site.isArchived);
  const archivedSites = jobSites.filter((site) => site.isArchived);
  const workingJobCodes = jobCodes.filter((job) => !job.isArchived);
  const archivedJobCodes = jobCodes.filter((job) => job.isArchived);
  const workingJobSections = buildJobCodeSections(workingJobCodes, jobSites);
  const archivedJobSections = buildJobCodeSections(archivedJobCodes, jobSites);
  const pendingProfiles = profiles.filter((profile) => !profile.isActive && !profile.isRejected);
  const visibleProfiles = profiles.filter((profile) => !profile.isRejected);

  const runAction = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save change.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="space-y-6">
        {error && <div className="rounded-md border border-error-border bg-error-bg p-3 text-sm font-semibold text-error-text">{error}</div>}

        <ThemePreferenceControl value={themePreference} onChange={onThemePreferenceChange} />

        {/* Employees */}
        <section id="employees" className="scroll-mt-20 rounded-md border border-app-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Employees</h2>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white" type="button" onClick={() => setAddEmployeeOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Add Employee
            </button>
          </div>
          {pendingProfiles.length > 0 && (
            <div className="mt-4 rounded-md border border-warn-border bg-warn-bg p-3">
              <h3 className="text-sm font-bold text-warning">Pending signups</h3>
              <p className="mt-1 text-xs font-semibold text-muted">Newly confirmed users appear here inactive. Set their role/rate below, then activate them when they should be allowed to punch time.</p>
              <div className="mt-3 space-y-2">
                {pendingProfiles.map((profile) => (
                  <div key={profile.id} className="flex flex-col gap-3 rounded-md bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{profile.firstName} {profile.lastName}</p>
                      <p className="break-words text-xs font-semibold text-muted">{profile.email}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className="min-h-9 rounded-md border border-error-border px-3 text-xs font-bold text-error-text" type="button" disabled={isBusy} onClick={() => runAction(async () => {
                        const confirmed = window.confirm(`Reject and delete signup request for ${profile.firstName} ${profile.lastName}? This removes their login request and cannot be undone.`);
                        if (!confirmed) return;
                        if (service.rejectSignup) {
                          await service.rejectSignup({ profileId: profile.id });
                          return;
                        }
                        if (service.deleteProfile) {
                          await service.deleteProfile({ profileId: profile.id });
                          return;
                        }
                        await service.updateProfile({ profileId: profile.id, patch: { isRejected: true, isActive: false } });
                      })}>Reject / Delete</button>
                      <button className="min-h-9 rounded-md border border-input-border px-3 text-xs font-bold text-muted-strong" type="button" disabled={isBusy} onClick={() => runAction(() => service.updateProfile({ profileId: profile.id, patch: { role: 'admin', isActive: true, isRejected: false } }).then())}>Approve - Admin</button>
                      <button className="min-h-9 rounded-md bg-accent px-3 text-xs font-bold text-white" type="button" disabled={isBusy} onClick={() => runAction(() => service.updateProfile({ profileId: profile.id, patch: { role: 'employee', isActive: true, isRejected: false } }).then())}>Approve - Employee</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {visibleProfiles.map((profile) => {
              const hasTimeHistory = entries.some((entry) => entry.userId === profile.id);
              const isCurrentProfile = profile.id === currentProfileId;
              return (
                <EmployeeRow
                  key={profile.id}
                  profile={profile}
                  isBusy={isBusy}
                  canDelete={Boolean(service.deleteProfile) && !hasTimeHistory && !isCurrentProfile}
                  hasTimeHistory={hasTimeHistory}
                  isCurrentProfile={isCurrentProfile}
                  onDelete={() => runAction(async () => {
                    if (!service.deleteProfile) throw new Error('Deleting employees is not available in this data mode.');
                    const confirmed = window.confirm(`Delete ${profile.firstName} ${profile.lastName}? This is only intended for employees with no payroll history.`);
                    if (!confirmed) return;
                    await service.deleteProfile({ profileId: profile.id });
                  })}
                  onSave={(patch) => runAction(() => service.updateProfile({ profileId: profile.id, patch }).then())}
                />
              );
            })}
          </div>
          {addEmployeeOpen && (
            <AddEmployeeDialog
              isBusy={isBusy}
              mode={service.mode ?? 'mock'}
              onCancel={() => setAddEmployeeOpen(false)}
              onSave={(values) => runAction(async () => {
                if (!service.createProfile) throw new Error('Adding employees is not available in this data mode.');
                await service.createProfile(values);
                setAddEmployeeOpen(false);
              })}
            />
          )}
        </section>

        {/* Properties */}
        <section id="properties" className="scroll-mt-20 rounded-md border border-app-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Properties</h2>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white" type="button" onClick={() => setAddSiteOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Add
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">Job codes sit under a property. Geofences default to 250m.</p>
          <div className="mt-4 space-y-3">
            {workingSites.length === 0 && <p className="rounded-md bg-card-alt p-3 text-sm text-muted">No properties yet.</p>}
            {workingSites.map((site) => (
              <JobSiteRow
                key={site.id}
                site={site}
                isBusy={isBusy}
                onSave={(patch) => runAction(() => service.updateJobSite({ jobSiteId: site.id, patch }).then())}
                onArchive={() => runAction(() => service.updateJobSite({ jobSiteId: site.id, patch: { isArchived: true, isActive: false } }).then())}
              />
            ))}
          </div>
          {archivedSites.length > 0 && (
            <div className="mt-5 border-t border-app-border-subtle pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-light">Archived properties</h3>
              <div className="mt-3 space-y-2">
                {archivedSites.map((site) => (
                  <div key={site.id} className="flex items-center justify-between gap-3 rounded-md border border-app-border bg-card-alt px-3 py-2.5">
                    <p className="font-semibold text-muted">{site.name}</p>
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input-border bg-card text-muted" type="button" onClick={() => runAction(() => service.updateJobSite({ jobSiteId: site.id, patch: { isArchived: false } }).then())}><RotateCcw size={14} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {addSiteOpen && (
            <AddJobSiteDialog
              isBusy={isBusy}
              onCancel={() => setAddSiteOpen(false)}
              onSave={(values) => runAction(async () => {
                await service.createJobSite(values);
                setAddSiteOpen(false);
              })}
            />
          )}
        </section>

        {/* Job Codes */}
        <section id="job-codes" className="scroll-mt-20 rounded-md border border-app-border bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Job Codes</h2>
            <button
              aria-label="Add job code"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white"
              type="button"
              onClick={() => setAddJobOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Add
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {workingJobCodes.length === 0 && <p className="rounded-md bg-card-alt p-3 text-sm text-muted">No active job codes.</p>}
            {workingJobSections.map((section) => (
              <div key={section.id} className="rounded-md border border-app-border bg-card">
                <div className="border-b border-app-border-subtle bg-card-alt px-4 py-2.5">
                  <p className="text-sm font-bold text-muted-strong">{section.name}</p>
                  <p className="text-xs font-semibold text-muted-light">{section.jobs.length} job code{section.jobs.length === 1 ? '' : 's'}</p>
                </div>
                <div className="space-y-2 p-3">
                  {section.jobs.map((job) => (
                    <JobCodeRow
                      key={job.id}
                      job={job}
                      jobSites={jobSites}
                      isBusy={isBusy}
                      isUsed={isJobCodeUsed(job, entries)}
                      onArchive={() => runAction(() => service.updateJobCode({ jobCodeId: job.id, patch: { isArchived: true, isActive: false } }).then())}
                      onToggleActive={() => runAction(() => service.updateJobCode({ jobCodeId: job.id, patch: { isActive: !job.isActive } }).then())}
                      onSave={(patch) => runAction(async () => {
                        await service.updateJobCode({ jobCodeId: job.id, patch });
                      })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {archivedJobCodes.length > 0 && (
            <div className="mt-5 border-t border-app-border-subtle pt-4">
              <button
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-app-border bg-card-alt px-3 text-left"
                type="button"
                onClick={() => setArchivedJobCodesOpen(!archivedJobCodesOpen)}
              >
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wide text-muted">Archived job codes</span>
                  <span className="mt-0.5 block text-xs font-semibold text-muted-light">{archivedJobCodes.length} job code{archivedJobCodes.length === 1 ? '' : 's'}</span>
                </span>
                {archivedJobCodesOpen ? <ChevronUp size={16} className="shrink-0 text-muted-light" aria-hidden="true" /> : <ChevronDown size={16} className="shrink-0 text-muted-light" aria-hidden="true" />}
              </button>
              {archivedJobCodesOpen && (
                <div className="mt-3 space-y-3">
                  {archivedJobSections.map((section) => (
                    <div key={section.id} className="rounded-md border border-app-border bg-card-alt">
                      <div className="border-b border-app-border px-3 py-2">
                        <p className="text-sm font-bold text-muted">{section.name}</p>
                      </div>
                      <div className="space-y-2 p-2">
                        {section.jobs.map((job) => (
                          <ArchivedJobCodeRow
                            key={job.id}
                            job={job}
                            propertyName={section.name}
                            isBusy={isBusy}
                            onRestore={() => runAction(() => service.updateJobCode({ jobCodeId: job.id, patch: { isArchived: false } }).then())}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {addJobOpen && (
            <AddJobCodeDialog
              isBusy={isBusy}
              jobSites={jobSites}
              onCancel={() => setAddJobOpen(false)}
              onSave={(values) => runAction(async () => {
                await service.createJobCode(values);
                setAddJobOpen(false);
              })}
            />
          )}
        </section>

        {/* Payroll gross-up multiplier (effective-dated, compact) */}
        <PayrollGrossUpPanel
          multipliers={grossUpMultipliers}
          isBusy={isBusy}
          onSave={(effectiveDate, multiplier, adminPassword) => runAction(() => onGrossUpMultiplierSave(effectiveDate, multiplier, adminPassword))}
          onDelete={(id, adminPassword) => runAction(() => onGrossUpMultiplierDelete(id, adminPassword))}
        />

        {/* Pay Period */}
        <PayPeriodSettingsPanel settings={payPeriodSettings} isBusy={isBusy} onSave={(nextSettings, adminPassword) => runAction(() => onPayPeriodSettingsChange(nextSettings, adminPassword))} />
    </section>
  );
}

function buildJobCodeSections(jobCodes: JobCode[], jobSites: JobSite[]) {
  const siteById = jobSiteById(jobSites);
  const sections = new Map<string, { id: string; name: string; jobs: JobCode[] }>();

  jobCodes.forEach((job) => {
    const site = job.jobSiteId ? siteById.get(job.jobSiteId) : null;
    const id = site?.id ?? 'no-property';
    if (!sections.has(id)) sections.set(id, { id, name: site?.name ?? 'No property', jobs: [] });
    sections.get(id)!.jobs.push(job);
  });

  return Array.from(sections.values())
    .map((section) => ({ ...section, jobs: section.jobs.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => {
      if (a.id === 'no-property') return 1;
      if (b.id === 'no-property') return -1;
      return a.name.localeCompare(b.name);
    });
}

const DEFAULT_PAYROLL_LOAD_FACTOR = 1.25;

function PayrollGrossUpPanel({
  multipliers,
  isBusy,
  onSave,
  onDelete,
}: {
  multipliers: PayrollGrossUpMultiplier[];
  isBusy: boolean;
  onSave: (effectiveDate: string, multiplier: number, adminPassword: string) => Promise<void>;
  onDelete: (id: string, adminPassword: string) => Promise<void>;
}) {
  const today = getAtlanticDateKey(new Date().toISOString());
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [multiplier, setMultiplier] = useState(DEFAULT_PAYROLL_LOAD_FACTOR.toString());
  const [pendingConfirmation, setPendingConfirmation] = useState<{ type: 'save' } | { type: 'delete'; id: string; effectiveDate: string } | null>(null);
  const sorted = [...multipliers].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const nextMultiplier = Number(multiplier);
  const isMultiplierValid = !Number.isNaN(nextMultiplier) && nextMultiplier >= 1;
  const canSave = Boolean(effectiveDate) && isMultiplierValid;

  return (
    <section id="gross-up-multiplier" className="scroll-mt-20 rounded-md border border-app-border bg-card p-5 shadow-soft">
      <h2 className="text-lg font-bold">Payroll gross-up multiplier</h2>
      <p className="mt-1 text-sm text-muted">Effective-dated multiplier for loaded labor cost in reporting. Each entry uses the value in effect on its work date, so setting a new effective date leaves earlier periods unchanged.</p>

      {sorted.length > 0 && (
        <ul className="mt-4 divide-y divide-app-border-subtle rounded-md border border-app-border-subtle">
          {sorted.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-semibold text-muted-strong">
                {entry.multiplier}x <span className="font-normal text-muted">· effective {formatAtlanticDate(entry.effectiveDate)}</span>
              </span>
              <button
                className="shrink-0 rounded p-1 text-muted-light hover:text-error-text disabled:opacity-40"
                type="button"
                aria-label={`Remove multiplier effective ${entry.effectiveDate}`}
                disabled={isBusy || sorted.length <= 1}
                onClick={() => setPendingConfirmation({ type: 'delete', id: entry.id, effectiveDate: entry.effectiveDate })}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,12rem)_max-content] sm:items-end">
        <label className="block min-w-0 text-xs font-semibold text-muted" htmlFor="gross-up-date">
          Effective date
          <input
            id="gross-up-date"
            className="mt-1 block box-border h-10 w-full min-w-0 max-w-full appearance-none rounded-md border border-input-border bg-card px-3 text-center"
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        </label>
        <label className="block min-w-0 text-xs font-semibold text-muted" htmlFor="gross-up-value">
          Multiplier
          <input
            id="gross-up-value"
            className="mt-1 block box-border h-10 w-full min-w-0 max-w-full rounded-md border border-input-border bg-card px-3"
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            value={multiplier}
            onChange={(event) => setMultiplier(event.target.value)}
          />
        </label>
        <button
          className="h-10 w-auto shrink-0 justify-self-start rounded-md bg-accent px-5 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted"
          type="button"
          disabled={isBusy || !canSave}
          onClick={() => setPendingConfirmation({ type: 'save' })}
        >
          Save
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-light">Saving an existing effective date updates that entry. 1.25 = gross payroll plus 25%.</p>
      {pendingConfirmation && (
        <AdminPasswordDialog
          title={pendingConfirmation.type === 'save' ? 'Confirm multiplier change' : 'Confirm multiplier deletion'}
          description={pendingConfirmation.type === 'save'
            ? 'Enter your admin password to update the payroll gross-up multiplier.'
            : `Enter your admin password to remove the multiplier effective ${formatAtlanticDate(pendingConfirmation.effectiveDate)}.`}
          isBusy={isBusy}
          confirmLabel={pendingConfirmation.type === 'save' ? 'Save Multiplier' : 'Delete Multiplier'}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={async (adminPassword) => {
            if (pendingConfirmation.type === 'save') {
              await onSave(effectiveDate, nextMultiplier, adminPassword);
            } else {
              await onDelete(pendingConfirmation.id, adminPassword);
            }
            setPendingConfirmation(null);
          }}
        />
      )}
    </section>
  );
}

function PayPeriodSettingsPanel({
  settings,
  isBusy,
  onSave,
}: {
  settings: PayPeriodSettings;
  isBusy: boolean;
  onSave: (settings: PayPeriodSettings, adminPassword: string) => Promise<void>;
}) {
  const [anchorStart, setAnchorStart] = useState(settings.anchorStart);
  const [lengthDays, setLengthDays] = useState(settings.lengthDays.toString());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const nextLengthDays = Number(lengthDays);
  const isLengthValid = !Number.isNaN(nextLengthDays) && nextLengthDays > 0;
  const periodPreview = getPayPeriodForDate(isLengthValid && anchorStart ? { ...settings, anchorStart, lengthDays: nextLengthDays } : settings);
  const hasChanges =
    anchorStart !== settings.anchorStart ||
    nextLengthDays !== settings.lengthDays;
  const canSave = hasChanges && anchorStart && isLengthValid;

  useEffect(() => {
    setAnchorStart(settings.anchorStart);
    setLengthDays(settings.lengthDays.toString());
    setConfirmOpen(false);
  }, [settings.anchorStart, settings.lengthDays]);

  return (
    <section id="pay-period" className="scroll-mt-20 rounded-md border border-app-border bg-card p-5 shadow-soft">
      <h2 className="text-lg font-bold">Pay Period</h2>
      <p className="mt-1 text-sm text-muted">Manage the payroll calendar that drives timesheets and reporting periods.</p>
      <div className="mt-4 space-y-4">
        <div className="rounded-md border border-app-border-subtle bg-card-alt p-4">
          <h3 className="text-sm font-bold">Pay period cadence</h3>
          <p className="mt-1 text-xs font-semibold text-muted">This global setting defines the first pay period start date. Every later period follows the selected cadence.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0 overflow-hidden text-sm font-semibold text-muted" htmlFor="period-start">
              First period start
              <input
                id="period-start"
                className="mt-1.5 block box-border h-11 w-full min-w-0 max-w-full appearance-none rounded-md border border-input-border bg-card px-3 text-center leading-[2.75rem]"
                type="date"
                value={anchorStart}
                onChange={(event) => setAnchorStart(event.target.value)}
              />
            </label>
            <label className="block min-w-0 text-sm font-semibold text-muted" htmlFor="period-length">
              Cadence
              <select
                id="period-length"
                className="mt-1.5 box-border h-11 w-full min-w-0 max-w-full rounded-md border border-input-border bg-card px-3"
                value={lengthDays}
                onChange={(event) => setLengthDays(event.target.value)}
              >
                <option value={7}>Weekly</option>
                <option value={14}>Biweekly</option>
                <option value={15}>Semi-monthly proxy</option>
                <option value={30}>Monthly proxy</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-md border border-app-border-subtle bg-card-alt p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-light">Current period</p>
            <p className="mt-1 text-sm font-semibold text-muted-strong">
              {formatAtlanticDate(periodPreview.start)} - {formatAtlanticDate(periodPreview.end)}
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="min-h-10 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted"
              type="button"
              disabled={isBusy || !canSave}
              onClick={() => setConfirmOpen(true)}
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
      {confirmOpen && (
        <AdminPasswordDialog
          title="Confirm pay period change"
          description="Enter your admin password to update the payroll start date or cadence. This changes the period boundaries used by timesheets and reports."
          isBusy={isBusy}
          confirmLabel="Save Settings"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async (adminPassword) => {
            await onSave({ ...settings, anchorStart, lengthDays: nextLengthDays }, adminPassword);
            setConfirmOpen(false);
          }}
        />
      )}
    </section>
  );
}

function AdminPasswordDialog({
  title,
  description,
  confirmLabel,
  isBusy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (adminPassword: string) => Promise<void>;
}) {
  const [adminPassword, setAdminPassword] = useState('');

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full rounded-t-md bg-card p-4 shadow-soft sm:mx-auto sm:max-w-md sm:rounded-md">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <label className="mt-4 block text-sm font-semibold text-muted" htmlFor="admin-confirm-password">
          Admin password
          <input
            id="admin-confirm-password"
            className="mt-2 box-border min-h-12 w-full rounded-md border border-input-border bg-card px-3"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && adminPassword.length > 0 && !isBusy) {
                void onConfirm(adminPassword);
              }
            }}
          />
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className="min-h-11 rounded-md border border-input-border px-4 font-bold text-muted-strong" type="button" disabled={isBusy} onClick={onCancel}>Cancel</button>
          <button
            className="min-h-11 rounded-md bg-accent px-4 font-bold text-white disabled:bg-app-border disabled:text-muted"
            type="button"
            disabled={isBusy || adminPassword.length === 0}
            onClick={() => void onConfirm(adminPassword)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeRow({
  profile,
  isBusy,
  canDelete,
  hasTimeHistory,
  isCurrentProfile,
  onDelete,
  onSave,
}: {
  profile: Profile;
  isBusy: boolean;
  canDelete: boolean;
  hasTimeHistory: boolean;
  isCurrentProfile: boolean;
  onDelete: () => void;
  onSave: (patch: Partial<Pick<Profile, 'firstName' | 'lastName' | 'role' | 'workerType' | 'contractorHstApplicable' | 'hourlyRate' | 'paidBreaks' | 'paidBreakMinutes' | 'canAccessScopes' | 'isActive'>>) => void;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [role, setRole] = useState<AppRole>(profile.role === 'admin' ? 'admin' : 'employee');
  const [workerType, setWorkerType] = useState<WorkerType>(profile.workerType);
  const [contractorHstApplicable, setContractorHstApplicable] = useState(profile.contractorHstApplicable);
  const [rate, setRate] = useState(profile.hourlyRate.toString());
  const [paidBreaks, setPaidBreaks] = useState(profile.paidBreaks);
  const [paidBreakMinutes, setPaidBreakMinutes] = useState(profile.paidBreakMinutes.toString());
  const [canAccessScopes, setCanAccessScopes] = useState(profile.canAccessScopes);
  const [canPunch, setCanPunch] = useState(profile.isActive);
  const [isExpanded, setIsExpanded] = useState(false);
  const rateNumber = Number(rate);
  const paidBreakMinutesNumber = Math.max(0, Math.min(240, Number(paidBreakMinutes)));
  const nextContractorHstApplicable = workerType === 'contractor' ? contractorHstApplicable : false;
  const hasChanges = firstName !== profile.firstName || lastName !== profile.lastName || role !== profile.role || workerType !== profile.workerType || nextContractorHstApplicable !== profile.contractorHstApplicable || rateNumber !== profile.hourlyRate || paidBreaks !== profile.paidBreaks || paidBreakMinutesNumber !== profile.paidBreakMinutes || canAccessScopes !== profile.canAccessScopes || canPunch !== profile.isActive;
  const summaryWorkerLabel = profile.role === 'admin' ? 'Admin' : profile.workerType === 'contractor' ? 'Contractor' : 'Employee';

  return (
    <div className="rounded-md border border-app-border">
      {/* Collapsed summary row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-bold">{profile.firstName} {profile.lastName}</p>
            {isCurrentProfile && <span className="text-xs font-semibold text-muted-light">you</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span>{summaryWorkerLabel}</span>
            {profile.workerType === 'contractor' && profile.contractorHstApplicable && (
              <>
                <span className="mx-1.5 text-muted-light">·</span>
                <span>HST</span>
              </>
            )}
            <span className="mx-1.5 text-muted-light">·</span>
            ${profile.hourlyRate.toFixed(2)}/hr
            {!profile.isActive && (
              <>
                <span className="mx-1.5 text-muted-light">·</span>
                <span className="font-semibold text-warning">Inactive</span>
              </>
            )}
            {profile.role === 'employee' && !profile.canAccessScopes && (
              <>
                <span className="mx-1.5 text-muted-light">·</span>
                <span className="font-semibold text-muted-light">No scope access</span>
              </>
            )}
          </p>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-app-border px-3 text-xs font-semibold text-muted transition hover:bg-card-alt"
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <><ChevronUp size={14} aria-hidden="true" /> Close</>
          ) : (
            <><Pencil size={13} aria-hidden="true" /> Edit</>
          )}
        </button>
      </div>

      {/* Expanded edit fields */}
      {isExpanded && (
        <div className="border-t border-app-border-subtle px-4 pb-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-muted">
              First name
              <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3 text-base text-ink" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Last name
              <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3 text-base text-ink" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Role
              <select className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3 text-base text-ink" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
                <option value="employee">Employee</option><option value="admin">Admin</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-muted">
              Worker type
              <select className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3 text-base text-ink" value={workerType} onChange={(event) => setWorkerType(event.target.value as WorkerType)}>
                <option value="employee">Employee</option><option value="contractor">Contractor</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-muted">
              Hourly rate
              <div className="mt-1.5 flex min-h-11 items-center rounded-md border border-input-border bg-card">
                <span className="pl-3 pr-1 text-sm font-bold text-muted-light">$</span>
                <input className="min-h-10 w-full rounded-r-md border-0 px-2 text-base text-ink outline-none" type="number" min="0" step="0.5" value={rate} onChange={(event) => setRate(event.target.value)} />
              </div>
            </label>
            <div className="text-sm font-semibold text-muted">
              <span>Contractor HST</span>
              <div className="mt-1.5 flex min-h-11 items-center rounded-md border border-input-border bg-card px-3">
                <ToggleSwitch label="" checked={workerType === 'contractor' && contractorHstApplicable} onChange={setContractorHstApplicable} disabled={isBusy || workerType !== 'contractor'} />
              </div>
              {workerType !== 'contractor' && <p className="mt-1 text-xs font-semibold text-muted-light">Only applies to contractors.</p>}
            </div>
            <div className="text-sm font-semibold text-muted">
              <span>Paid lunch</span>
              <div className="mt-1.5 flex min-h-11 items-center rounded-md border border-input-border bg-card px-3">
                <ToggleSwitch label="" checked={paidBreaks} onChange={setPaidBreaks} disabled={isBusy} />
              </div>
            </div>
            <label className="block text-sm font-semibold text-muted">
              Paid lunch limit
              <input
                className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3 text-base text-ink disabled:bg-card-alt disabled:text-muted-light"
                type="number"
                min="0"
                max="240"
                step="5"
                value={paidBreakMinutes}
                onChange={(event) => setPaidBreakMinutes(event.target.value)}
                disabled={isBusy || !paidBreaks}
              />
            </label>
            <div className="text-sm font-semibold text-muted">
              <span>Active</span>
              <div className="mt-1.5 flex min-h-11 items-center rounded-md border border-input-border bg-card px-3">
                <ToggleSwitch label="" checked={canPunch} onChange={setCanPunch} disabled={isBusy} />
              </div>
            </div>
            <div className="text-sm font-semibold text-muted">
              <span>Scope access</span>
              <div className="mt-1.5 flex min-h-11 items-center rounded-md border border-input-border bg-card px-3">
                <ToggleSwitch label="" checked={role === 'admin' ? true : canAccessScopes} onChange={setCanAccessScopes} disabled={isBusy || role === 'admin'} />
              </div>
              {role === 'admin' && <p className="mt-1 text-xs font-semibold text-muted-light">Admins always have scope access.</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted sm:flex-none"
              type="button"
              disabled={isBusy || !hasChanges || !firstName.trim() || !lastName.trim() || Number.isNaN(rateNumber) || Number.isNaN(paidBreakMinutesNumber)}
              onClick={() => onSave({ firstName: firstName.trim(), lastName: lastName.trim(), role, workerType, contractorHstApplicable: nextContractorHstApplicable, hourlyRate: rateNumber, paidBreaks, paidBreakMinutes: paidBreakMinutesNumber, canAccessScopes: role === 'admin' ? true : canAccessScopes, isActive: canPunch })}
            >
              <Save size={15} aria-hidden="true" />
              Save Changes
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-error-border px-4 text-sm font-semibold text-error-text transition hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isBusy || !canDelete}
              title={isCurrentProfile ? 'Cannot delete yourself' : hasTimeHistory ? 'Cannot delete employees with time history' : 'Delete employee'}
              type="button"
              onClick={onDelete}
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobCodeRow({
  job,
  jobSites,
  isBusy,
  isUsed,
  onArchive,
  onToggleActive,
  onSave,
}: {
  job: JobCode;
  jobSites: JobSite[];
  isBusy: boolean;
  isUsed: boolean;
  onArchive: () => void;
  onToggleActive: () => void;
  onSave: (patch: Partial<Pick<JobCode, 'jobSiteId' | 'code' | 'name' | 'description' | 'isActive' | 'isArchived'>>) => Promise<void> | void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [jobSiteId, setJobSiteId] = useState(job.jobSiteId ?? '');
  const [code, setCode] = useState(job.code ?? '');
  const [name, setName] = useState(job.name);
  const [description, setDescription] = useState(job.description ?? '');
  const siteById = jobSiteById(jobSites);
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const hasValidCode = /^[A-Z]{2}\d{4}$/.test(normalizedCode);
  const hasChanges = jobSiteId !== (job.jobSiteId ?? '') || normalizedCode !== (job.code ?? '') || name !== job.name || description !== (job.description ?? '');

  return (
    <div className="rounded-md border border-app-border">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-badge-code px-2 py-1 font-mono text-xs font-bold text-white">{job.code ?? 'NEW'}</span>
            <p className="min-w-0 break-words font-bold">{job.name}</p>
            <span className="max-w-full rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">{jobPropertyName(job, job.jobSiteId ? siteById.get(job.jobSiteId) : null)}</span>
          </div>
          {job.description && <p className="mt-0.5 break-words text-sm text-muted">{job.description}</p>}
          {isUsed && <p className="mt-1 text-xs font-semibold text-accent">Used on time records. Title and property can still be corrected until payroll is approved/exported.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          <div className="mr-auto flex items-center gap-2 sm:mr-0">
            <span className="text-xs font-semibold text-muted">{job.isActive ? 'Active' : 'Off'}</span>
            <ToggleSwitch label="" checked={job.isActive} onChange={() => onToggleActive()} disabled={isBusy} />
          </div>
          <button className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-app-border px-3 text-xs font-semibold text-muted transition hover:bg-card-alt" type="button" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
            {isExpanded ? 'Close' : 'Edit'}
          </button>
          <button
            aria-label={`Archive ${job.name}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-app-border px-3 text-xs font-semibold text-muted transition hover:bg-card-alt disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isBusy}
            title="Archive job code"
            type="button"
            onClick={onArchive}
          >
            <Archive size={13} aria-hidden="true" />
            Archive
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="grid gap-3 border-t border-app-border-subtle px-4 pb-4 pt-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-muted">
            Property
            <select className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3 disabled:bg-card-alt disabled:text-muted-light" value={jobSiteId} onChange={(event) => setJobSiteId(event.target.value)}>
              <option value="">No property</option>
              {jobSites.filter((site) => !site.isArchived).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-muted">
            Job code
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3 font-mono uppercase disabled:bg-card-alt disabled:text-muted-light" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Job title
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3 disabled:bg-card-alt disabled:text-muted-light" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted sm:col-span-2">
            Description
            <textarea className="mt-1.5 min-h-20 w-full rounded-md border border-input-border p-3" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          {!hasValidCode && <p className="text-sm font-semibold text-error-text sm:col-span-2">Use two letters followed by four digits, like EX0001.</p>}
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted sm:col-span-2" type="button" disabled={isBusy || !hasChanges || !name.trim() || !hasValidCode} onClick={async () => { await onSave({ jobSiteId: jobSiteId || null, code: normalizedCode, name: name.trim(), description: description.trim() || undefined }); setIsExpanded(false); }}>
            <Save size={15} aria-hidden="true" />
            Save Job Code
          </button>
        </div>
      )}
    </div>
  );
}

function ArchivedJobCodeRow({ job, propertyName, isBusy, onRestore }: { job: JobCode; propertyName: string; isBusy: boolean; onRestore: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-app-border bg-card px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-app-border px-2 py-1 font-mono text-xs font-bold text-muted">{job.code ?? 'OLD'}</span>
          <p className="break-words font-semibold text-muted">{job.name}</p>
          <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted-light">{propertyName}</span>
        </div>
        {job.description && <p className="mt-0.5 text-sm text-muted-light">{job.description}</p>}
      </div>
      <button
        aria-label={`Restore ${job.name}`}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input-border bg-card text-muted transition hover:bg-badge-neutral disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isBusy}
        title="Restore job code"
        type="button"
        onClick={onRestore}
      >
        <RotateCcw size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function JobSiteRow({ site, isBusy, onSave, onArchive }: { site: JobSite; isBusy: boolean; onSave: (patch: Partial<Pick<JobSite, 'name' | 'address' | 'latitude' | 'longitude' | 'geofenceRadiusMeters'>>) => void; onArchive: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState(site.name);
  const [address, setAddress] = useState(site.address ?? '');
  const [latitude, setLatitude] = useState(site.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(site.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(site.geofenceRadiusMeters.toString());
  const latNumber = latitude.trim() ? Number(latitude) : null;
  const lngNumber = longitude.trim() ? Number(longitude) : null;
  const radiusNumber = Math.max(25, Math.min(5000, Number(radius)));
  const hasChanges = name !== site.name || address !== (site.address ?? '') || latNumber !== (site.latitude ?? null) || lngNumber !== (site.longitude ?? null) || radiusNumber !== site.geofenceRadiusMeters;
  const hasSavedCoordinates = site.latitude !== null && site.latitude !== undefined && site.longitude !== null && site.longitude !== undefined;
  const currentLatitude = Number.isNaN(latNumber ?? 0) ? null : latNumber;
  const currentLongitude = Number.isNaN(lngNumber ?? 0) ? null : lngNumber;

  return (
    <div className="rounded-md border border-app-border">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="break-words font-bold">{site.name}</p>
          <p className="mt-0.5 break-words text-sm text-muted">{site.address || 'No address set'} · {hasSavedCoordinates ? `${site.latitude!.toFixed(5)}, ${site.longitude!.toFixed(5)}` : 'No GPS center'} · {site.geofenceRadiusMeters}m</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          {(hasSavedCoordinates || site.address) && (
            <a className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-app-border text-muted" href={hasSavedCoordinates ? googleMapsCoordinatesUrl(site.latitude!, site.longitude!) : googleMapsSearchUrl(site.address!)} rel="noreferrer" target="_blank" title={hasSavedCoordinates ? 'Open saved coordinates in Google Maps' : 'Open address in Google Maps'}>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          <button className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-app-border px-3 text-xs font-semibold text-muted" type="button" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
            {isExpanded ? 'Close' : 'Edit'}
          </button>
          <button className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-app-border px-3 text-xs font-semibold text-muted" type="button" disabled={isBusy} onClick={onArchive}>
            <Archive size={13} aria-hidden="true" />
            Archive
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="grid gap-3 border-t border-app-border-subtle px-4 pb-4 pt-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-muted">
            Property name
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Address
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3" value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Latitude
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3" type="number" step="0.000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Longitude
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3" type="number" step="0.000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Geofence radius
            <input className="mt-1.5 min-h-11 w-full rounded-md border border-input-border px-3" type="number" min="25" max="5000" step="25" value={radius} onChange={(event) => setRadius(event.target.value)} />
          </label>
          <CoordinateLookup
            address={address}
            latitude={currentLatitude}
            longitude={currentLongitude}
            isBusy={isBusy}
            onCoordinates={(coordinates) => {
              setLatitude(coordinates.latitude.toFixed(7));
              setLongitude(coordinates.longitude.toFixed(7));
            }}
          />
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted sm:self-end" type="button" disabled={isBusy || !hasChanges || !name.trim() || Number.isNaN(radiusNumber) || Number.isNaN(latNumber ?? 0) || Number.isNaN(lngNumber ?? 0)} onClick={() => onSave({ name: name.trim(), address: address.trim() || null, latitude: latNumber, longitude: lngNumber, geofenceRadiusMeters: radiusNumber })}>
            <Save size={15} aria-hidden="true" />
            Save Property
          </button>
        </div>
      )}
    </div>
  );
}

function CoordinateLookup({
  address,
  latitude,
  longitude,
  isBusy,
  onCoordinates,
}: {
  address: string;
  latitude: number | null;
  longitude: number | null;
  isBusy: boolean;
  onCoordinates: (coordinates: { latitude: number; longitude: number }) => void;
}) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const hasCoordinates = latitude !== null && longitude !== null;

  const handleLookup = async () => {
    setIsGeocoding(true);
    setLookupError(null);
    setLookupMessage(null);
    try {
      const result = await geocodeAddress(address);
      onCoordinates({ latitude: result.latitude, longitude: result.longitude });
      setLookupMessage(`Calculated from: ${result.displayName}`);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to calculate coordinates.');
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="rounded-md border border-app-border bg-card-alt p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-input-border bg-card px-3 text-sm font-bold text-muted-strong disabled:opacity-50"
          type="button"
          disabled={isBusy || isGeocoding || !address.trim()}
          onClick={handleLookup}
        >
          <MapPin size={14} aria-hidden="true" />
          {isGeocoding ? 'Calculating...' : 'Calculate Coordinates'}
        </button>
        {hasCoordinates && (
          <a className="inline-flex min-h-10 items-center gap-2 rounded-md border border-input-border bg-card px-3 text-sm font-bold text-muted-strong" href={googleMapsCoordinatesUrl(latitude, longitude)} rel="noreferrer" target="_blank">
            <ExternalLink size={14} aria-hidden="true" />
            Test Pin in Google Maps
          </a>
        )}
      </div>
      {hasCoordinates && <p className="mt-2 text-xs font-semibold text-muted">Current coordinate pin: {latitude.toFixed(7)}, {longitude.toFixed(7)}</p>}
      {lookupMessage && <p className="mt-2 text-xs font-semibold text-accent">{lookupMessage}</p>}
      {lookupError && <p className="mt-2 text-xs font-semibold text-error-text">{lookupError}</p>}
    </div>
  );
}

function AddJobSiteDialog({ isBusy, onCancel, onSave }: { isBusy: boolean; onCancel: () => void; onSave: (values: { name: string; address?: string; latitude?: number | null; longitude?: number | null; geofenceRadiusMeters?: number }) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('250');
  const latNumber = latitude.trim() ? Number(latitude) : null;
  const lngNumber = longitude.trim() ? Number(longitude) : null;
  const radiusNumber = Math.max(25, Math.min(5000, Number(radius)));
  const canSave = name.trim().length > 0 && !Number.isNaN(radiusNumber) && !Number.isNaN(latNumber ?? 0) && !Number.isNaN(lngNumber ?? 0);
  const currentLatitude = Number.isNaN(latNumber ?? 0) ? null : latNumber;
  const currentLongitude = Number.isNaN(lngNumber ?? 0) ? null : lngNumber;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-md bg-card p-4 shadow-soft sm:mx-auto sm:max-w-xl sm:rounded-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Add property</h3>
            <p className="mt-1 text-sm text-muted">Enter an address, calculate coordinates, then test the coordinate pin in Google Maps.</p>
          </div>
          <button className="min-h-10 rounded-md border border-input-border px-3 font-bold" type="button" onClick={onCancel}>Close</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-muted">
            Property name
            <input className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Address
            <input className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Latitude
            <input className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" type="number" step="0.000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted">
            Longitude
            <input className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" type="number" step="0.000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted sm:col-span-2">
            Geofence radius
            <input className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" type="number" min="25" max="5000" step="25" value={radius} onChange={(event) => setRadius(event.target.value)} />
          </label>
          <CoordinateLookup
            address={address}
            latitude={currentLatitude}
            longitude={currentLongitude}
            isBusy={isBusy}
            onCoordinates={(coordinates) => {
              setLatitude(coordinates.latitude.toFixed(7));
              setLongitude(coordinates.longitude.toFixed(7));
            }}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className="min-h-12 rounded-md border border-input-border px-4 font-bold text-muted-strong" type="button" onClick={onCancel}>Cancel</button>
          <button className="min-h-12 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={isBusy || !canSave} onClick={() => onSave({ name: name.trim(), address: address.trim() || undefined, latitude: latNumber, longitude: lngNumber, geofenceRadiusMeters: radiusNumber })}>
            Save Property
          </button>
        </div>
      </div>
    </div>
  );
}

function AddJobCodeDialog({ isBusy, jobSites, onCancel, onSave }: { isBusy: boolean; jobSites: JobSite[]; onCancel: () => void; onSave: (values: { jobSiteId?: string | null; code?: string; name: string; description?: string }) => void }) {
  const [jobSiteId, setJobSiteId] = useState(jobSites.find((site) => !site.isArchived)?.id ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const hasValidCode = !normalizedCode || /^[A-Z]{2}\d{4}$/.test(normalizedCode);
  const canSave = name.trim().length > 0 && hasValidCode;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-md bg-card p-4 shadow-soft sm:mx-auto sm:max-w-lg sm:rounded-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Add job code</h3>
            <p className="mt-1 text-sm text-muted">The app will generate the two-letter, four-digit code automatically unless you enter one.</p>
          </div>
          <button className="min-h-10 rounded-md border border-input-border px-3 font-bold" type="button" onClick={onCancel}>Close</button>
        </div>
        <label className="mt-4 block text-sm font-semibold text-muted" htmlFor="job-code-property">
          Property
          <select id="job-code-property" className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3" value={jobSiteId} onChange={(event) => setJobSiteId(event.target.value)}>
            <option value="">No property</option>
            {jobSites.filter((site) => !site.isArchived).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="mt-4 block text-sm font-semibold text-muted" htmlFor="job-code-name">
          Job title
          <input id="job-code-name" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="mt-4 block text-sm font-semibold text-muted" htmlFor="job-code-code">
          Job code
          <input id="job-code-code" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3 font-mono uppercase" value={code} maxLength={6} placeholder="Auto" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} />
        </label>
        {!hasValidCode && <p className="mt-2 text-sm font-semibold text-error-text">Use two letters followed by four digits, like EX0001.</p>}
        <label className="mt-3 block text-sm font-semibold text-muted" htmlFor="job-code-description">
          Description
          <textarea id="job-code-description" className="mt-2 min-h-24 w-full rounded-md border border-input-border p-3" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className="min-h-12 rounded-md border border-input-border px-4 font-bold text-muted-strong" type="button" onClick={onCancel}>Cancel</button>
          <button
            className="min-h-12 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60"
            type="button"
            disabled={isBusy || !canSave}
            onClick={() => onSave({ jobSiteId: jobSiteId || null, code: normalizedCode || undefined, name: name.trim(), description: description.trim() || undefined })}
          >
            Save Job Code
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEmployeeDialog({ isBusy, mode, onCancel, onSave }: { isBusy: boolean; mode: 'mock' | 'supabase'; onCancel: () => void; onSave: (values: { authUserId?: string; email: string; firstName: string; lastName: string; role: AppRole; workerType: WorkerType; contractorHstApplicable: boolean; hourlyRate: number; paidBreaks: boolean; paidBreakMinutes: number; canAccessScopes: boolean; isActive: boolean }) => void }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<AppRole>('employee');
  const [workerType, setWorkerType] = useState<WorkerType>('employee');
  const [contractorHstApplicable, setContractorHstApplicable] = useState(false);
  const [rate, setRate] = useState('0');
  const [paidBreaks, setPaidBreaks] = useState(false);
  const [paidBreakMinutes, setPaidBreakMinutes] = useState('30');
  const [canAccessScopes, setCanAccessScopes] = useState(true);
  const canSave = email.trim() && firstName.trim() && lastName.trim();

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-md bg-card p-4 shadow-soft sm:mx-auto sm:max-w-xl sm:rounded-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Add employee</h3>
            <p className="mt-1 text-sm text-muted">{mode === 'supabase' ? 'The employee will receive a password reset email to set up their login.' : 'Adds an employee to the mock workspace.'}</p>
          </div>
          <button className="min-h-10 rounded-md border border-input-border px-3 font-bold" type="button" onClick={onCancel}>Close</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-first">
            First name
            <input id="employee-first" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-last">
            Last name
            <input id="employee-last" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted sm:col-span-2" htmlFor="employee-email">
            Email
            <input id="employee-email" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-role">
            Role
            <select id="employee-role" className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
              <option value="employee">Employee</option><option value="admin">Admin</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-worker-type">
            Worker type
            <select id="employee-worker-type" className="mt-2 min-h-12 w-full rounded-md border border-input-border bg-card px-3" value={workerType} onChange={(event) => setWorkerType(event.target.value as WorkerType)}>
              <option value="employee">Employee</option><option value="contractor">Contractor</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-rate">
            Hourly rate
            <input id="employee-rate" className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3" type="number" min="0" step="0.5" value={rate} onChange={(event) => setRate(event.target.value)} />
          </label>
          <div className="rounded-md border border-app-border px-3 py-2">
            <ToggleSwitch label="Contractor HST" checked={workerType === 'contractor' && contractorHstApplicable} onChange={setContractorHstApplicable} disabled={isBusy || workerType !== 'contractor'} />
          </div>
          <div className="rounded-md border border-app-border px-3 py-2 sm:col-span-2">
            <ToggleSwitch label="Paid Lunch" checked={paidBreaks} onChange={setPaidBreaks} disabled={isBusy} />
          </div>
          <div className="rounded-md border border-app-border px-3 py-2 sm:col-span-2">
            <ToggleSwitch label="Scope access" checked={role === 'admin' ? true : canAccessScopes} onChange={setCanAccessScopes} disabled={isBusy || role === 'admin'} />
            <p className="mt-1 text-xs font-semibold text-muted">Turn this off for employees who should not see or edit scope checklists.</p>
          </div>
          <label className="block text-sm font-semibold text-muted sm:col-span-2" htmlFor="employee-paid-break-minutes">
            Paid lunch minutes
            <input
              id="employee-paid-break-minutes"
              className="mt-2 min-h-12 w-full rounded-md border border-input-border px-3 disabled:bg-card-alt disabled:text-muted-light"
              type="number"
              min="0"
              max="240"
              step="5"
              value={paidBreakMinutes}
              onChange={(event) => setPaidBreakMinutes(event.target.value)}
              disabled={isBusy || !paidBreaks}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className="min-h-12 rounded-md border border-input-border px-4 font-bold text-muted-strong" type="button" onClick={onCancel}>Cancel</button>
          <button className="min-h-12 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={isBusy || !canSave} onClick={() => onSave({ email, firstName, lastName, role, workerType, contractorHstApplicable: workerType === 'contractor' ? contractorHstApplicable : false, hourlyRate: Number(rate), paidBreaks, paidBreakMinutes: Math.max(0, Math.min(240, Number(paidBreakMinutes))), canAccessScopes: role === 'admin' ? true : canAccessScopes, isActive: true })}>
            Save Employee
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      className={`flex min-h-9 items-center gap-3 text-left disabled:opacity-60 ${label ? 'w-full justify-between' : ''}`}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      {label && <span className="text-sm font-bold text-muted-strong">{label}</span>}
      <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-success' : 'bg-input-border'}`}>
        <span className={`h-5 w-5 rounded-full bg-card shadow-sm transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  );
}
