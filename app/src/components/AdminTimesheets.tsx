import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry, TimesheetApproval } from '../domain/types';
import { getPayPeriodDays, getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import type { AdminTimeClockService } from '../services/TimeClockService';
import { getEntryGpsVerification, googleMapsCoordinatesUrl, gpsDistanceMeters, jobDisplayName, jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { addDaysToDateKey, calculateTimesheetSummary, formatAtlanticDate, formatAtlanticDateTime, formatAtlanticDateTimeInput, formatDurationCompact, getAtlanticDateKey, getEntryDurationHours, groupEntriesByAtlanticDate, parseAtlanticDateTimeInput } from '../utils/time';

interface AdminTimesheetsProps {
  adminProfile: Profile;
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  approvals: TimesheetApproval[];
  payPeriodSettings: PayPeriodSettings;
  service: AdminTimeClockService;
  onDataChange: () => Promise<void>;
}

type AdminTimesheetView = 'summary' | 'punch-log';

export function AdminTimesheets({ adminProfile, profiles, jobSites, jobCodes, entries, approvals, payPeriodSettings, service, onDataChange }: AdminTimesheetsProps) {
  const employees = profiles.filter((profile) => profile.role === 'employee');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? '');
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [viewMode, setViewMode] = useState<AdminTimesheetView>('summary');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const employee = employees.find((profile) => profile.id === selectedEmployeeId) ?? employees[0];
  const periodDays = getPayPeriodDays(payPeriodSettings, periodStart);
  const profileEntries = entries.filter((entry) => entry.userId === employee?.id && periodDays.includes(getAtlanticDateKey(entry.clockIn)));
  const summary = calculateTimesheetSummary(profileEntries, employee?.hourlyRate ?? 0, new Date(), {
    paidBreaks: employee?.paidBreaks ?? false,
    paidBreakMinutes: employee?.paidBreakMinutes ?? 30,
    weeklyOvertimeThresholdHours: payPeriodSettings.weeklyOvertimeThresholdHours,
  });
  const groupedEntries = groupEntriesByAtlanticDate(profileEntries);
  const displayDays = [...periodDays].reverse();
  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => new Map(jobSites.map((site) => [site.id, site])), [jobSites]);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const editingEntry = entries.find((entry) => entry.id === editingEntryId) ?? null;
  const periodApproval = employee ? approvals.find((approval) => approval.userId === employee.id && approval.weekStart === periodStart) : null;
  const isPeriodApproved = periodApproval?.status === 'approved';

  useEffect(() => {
    setEditingEntryId(null);
    setManualOpen(false);
  }, [selectedEmployeeId, periodStart]);

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
  }, [currentPeriod.start, payPeriodSettings.lengthDays]);

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
    <section className="space-y-4">
      {error && <div className="rounded-md border border-error-border bg-error-bg p-3 text-sm font-semibold text-error-text">{error}</div>}

      {/* Employee selector + pay period nav */}
      <div id="ts-employee" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-muted" htmlFor="employee-select">
            Employee
            <select id="employee-select" className="mt-1.5 min-h-12 w-full rounded-md border border-input-border bg-card px-3 text-base text-ink" value={employee?.id ?? ''} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
              {employees.map((profile) => <option key={profile.id} value={profile.id}>{profile.firstName} {profile.lastName}</option>)}
            </select>
          </label>
          <div className="flex flex-col justify-end">
            <p className="text-sm font-semibold text-muted">Pay period</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <button className="min-h-12 rounded-md border border-input-border px-3 font-bold" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, -payPeriodSettings.lengthDays))}>Prev</button>
              <p className="text-center text-sm font-bold">{formatAtlanticDate(periodStart)} - {formatAtlanticDate(periodDays[periodDays.length - 1])}</p>
              <button className="min-h-12 rounded-md border border-input-border px-3 font-bold" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, payPeriodSettings.lengthDays))}>Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Pay period summary */}
      <div id="ts-summary" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <h2 className="text-lg font-bold">Pay period summary</h2>
        <p className="mt-1 text-sm font-semibold text-muted">{employee?.paidBreaks ? `${employee.paidBreakMinutes} paid lunch minutes included` : 'Lunches excluded for this employee'}</p>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Metric label="Net work hours" value={`${summary.netWorkHours.toFixed(2)}h`} />
          <Metric label="OT hours" value={`${summary.overtimeHours.toFixed(2)}h`} />
          <Metric label="Gross Pay" value={`$${summary.grossPay.toFixed(2)}`} />
        </dl>
      </div>

      {/* Timesheet entries */}
      <div id="ts-entries" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Timesheet entries</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className={`text-sm font-bold ${isPeriodApproved ? 'text-error-text' : 'text-muted'}`}>{isPeriodApproved ? 'Locked for approval' : 'Unlocked for review'}</p>
              {isPeriodApproved && periodApproval?.approvedAt && (
                <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Approved {formatAtlanticDateTime(periodApproval.approvedAt)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
            {isPeriodApproved && periodApproval ? (
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-input-border px-4 text-sm font-bold text-muted-strong disabled:opacity-60" type="button" disabled={isBusy} onClick={() => runAction(() => service.unapproveTimesheet({ approvalId: periodApproval.id }).then())}>Unlock Period</button>
            ) : (
              <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:opacity-60" type="button" disabled={isBusy || !employee} onClick={() => employee && runAction(() => service.approveTimesheet({ userId: employee.id, weekStart: periodStart, weekEnd: periodDays[periodDays.length - 1], approvedBy: adminProfile.id }).then())}>Approve Period</button>
            )}
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:bg-app-border disabled:text-muted" type="button" disabled={isPeriodApproved} title={isPeriodApproved ? 'Unlock the pay period before adding entries.' : 'Add manual entry'} onClick={() => setManualOpen(true)}>Add Manual Entry</button>
          </div>
        </div>
        {isPeriodApproved && <p className="mt-3 rounded-md border border-error-border bg-error-bg p-3 text-sm font-semibold text-error-text">This pay period is approved. Unlock it before making corrections.</p>}
        <div className="mt-4">
          {profileEntries.length === 0 && <p className="text-sm text-muted">No entries for this week.</p>}
          {viewMode === 'summary' && displayDays.map((day) => {
              const dayEntries = [...(groupedEntries[day] ?? [])].sort((a, b) => b.clockIn.localeCompare(a.clockIn));
              if (dayEntries.length === 0) return null;
              const daySummary = calculateTimesheetSummary(dayEntries, employee?.hourlyRate ?? 0, new Date(), {
                paidBreaks: employee?.paidBreaks ?? false,
                paidBreakMinutes: employee?.paidBreakMinutes ?? 30,
                weeklyOvertimeThresholdHours: payPeriodSettings.weeklyOvertimeThresholdHours,
              });
              const isOpen = dayEntries.some((entry) => !entry.clockOut);

              return (
                <section key={day} className="time-day-panel py-5 first:pt-0 last:pb-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">{formatAtlanticDate(day)}</h3>
                    <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Net work hours {daySummary.netWorkHours.toFixed(2)}h</span>
                  </div>
                  <div className="space-y-3">
                    {dayEntries.map((entry) => (
                      <TimesheetEntryCard
                        key={entry.id}
                        entry={entry}
                        jobById={jobById}
                        siteById={siteById}
                        profileById={profileById}
                        isPeriodApproved={isPeriodApproved}
                        onEdit={() => setEditingEntryId(entry.id)}
                      />
                    ))}
                  </div>
                  <DailyBreakdown summary={daySummary} isOpen={isOpen} showPaidLunchCredit={employee?.paidBreaks ?? false} />
                </section>
              );
            })}
          {viewMode === 'punch-log' && (
            <PunchLogView
              displayDays={displayDays}
              groupedEntries={groupedEntries}
              jobById={jobById}
              siteById={siteById}
              isPeriodApproved={isPeriodApproved}
              onEdit={(entry) => setEditingEntryId(entry.id)}
            />
          )}
        </div>
      </div>
      {editingEntry && !isPeriodApproved && <EntryEditor entry={editingEntry} jobSites={jobSites} jobCodes={jobCodes} isBusy={isBusy} onCancel={() => setEditingEntryId(null)} onSave={(patch) => runAction(async () => { await service.updateTimeEntry({ entryId: editingEntry.id, patch, editedBy: adminProfile.id }); setEditingEntryId(null); })} onDelete={() => runAction(async () => { await service.deleteTimeEntry({ entryId: editingEntry.id }); setEditingEntryId(null); })} />}
      {manualOpen && employee && !isPeriodApproved && <ManualEntryForm employee={employee} jobSites={jobSites} jobCodes={jobCodes} isBusy={isBusy} onCancel={() => setManualOpen(false)} onSave={(values) => runAction(async () => { await service.createManualEntry({ ...values, userId: employee.id, createdBy: adminProfile.id }); setManualOpen(false); })} />}
    </section>
  );
}

function ViewModeSwitch({ value, onChange }: { value: AdminTimesheetView; onChange: (value: AdminTimesheetView) => void }) {
  const options: Array<{ value: AdminTimesheetView; label: string }> = [
    { value: 'summary', label: 'Summary' },
    { value: 'punch-log', label: 'Punch log' },
  ];

  return (
    <div className="view-mode-switch" aria-label="Timesheet view">
      <div className="view-mode-options">
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              className={`view-mode-option ${isActive ? 'is-active' : ''}`}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimesheetEntryCard({
  entry,
  jobById,
  siteById,
  profileById,
  isPeriodApproved,
  onEdit,
}: {
  entry: TimeEntry;
  jobById: Map<string, JobCode>;
  siteById: Map<string, JobSite>;
  profileById: Map<string, Profile>;
  isPeriodApproved: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-md bg-card-alt p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <span className="mb-2 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">{formatDurationCompact(getEntryDurationHours(entry))}</span>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{entry.eventType === 'break' ? 'Break' : jobDisplayNameById(entry.jobCodeId, jobById, siteById)}</p>
            <p className="text-sm text-muted">{formatAtlanticDateTime(entry.clockIn)} - {entry.clockOut ? formatAtlanticDateTime(entry.clockOut) : 'In progress'}</p>
          </div>
          <span className="text-sm font-bold">{getEntryDurationHours(entry).toFixed(2)}h</span>
        </div>
        {entry.notes && <p className="mt-2 text-sm text-muted">{entry.notes}</p>}
        <GpsCue entry={entry} jobById={jobById} siteById={siteById} />
        <EntryTrustCue entry={entry} profileById={profileById} />
      </div>
      <button className="timesheet-edit-button rounded-md border border-input-border px-4 font-bold disabled:opacity-40" type="button" disabled={isPeriodApproved} title={isPeriodApproved ? 'Unlock the pay period before editing entries.' : 'Edit entry'} onClick={onEdit}>Edit</button>
    </div>
  );
}

function DailyBreakdown({
  summary,
  isOpen,
  showPaidLunchCredit,
}: {
  summary: ReturnType<typeof calculateTimesheetSummary>;
  isOpen: boolean;
  showPaidLunchCredit: boolean;
}) {
  return (
    <div className="mt-4 rounded-md bg-card-alt p-4 text-sm">
      <div className="flex items-center justify-between gap-4 font-semibold text-muted-strong">
        <span>Work time</span>
        <span>{summary.grossWorkHours.toFixed(2)}h</span>
      </div>
      <div className="ml-4 mt-2 flex items-center justify-between gap-4 font-semibold text-muted">
        <span>Break time</span>
        <span>-{summary.breakHours.toFixed(2)}h</span>
      </div>
      {showPaidLunchCredit && (
        <div className="ml-4 mt-2 flex items-center justify-between gap-4 font-semibold text-muted">
          <span>Paid lunch credit</span>
          <span>+{summary.paidBreakHours.toFixed(2)}h</span>
        </div>
      )}
      <div className="mt-3 border-t border-app-border-subtle pt-3">
        <div className="flex items-center justify-between gap-4 font-bold">
          <span>{isOpen ? 'Net work hours so far' : 'Net work hours'}</span>
          <span>{summary.netWorkHours.toFixed(2)}h</span>
        </div>
      </div>
    </div>
  );
}

function PunchLogView({
  displayDays,
  groupedEntries,
  jobById,
  siteById,
  isPeriodApproved,
  onEdit,
}: {
  displayDays: string[];
  groupedEntries: Record<string, TimeEntry[]>;
  jobById: Map<string, JobCode>;
  siteById: Map<string, JobSite>;
  isPeriodApproved: boolean;
  onEdit: (entry: TimeEntry) => void;
}) {
  return (
    <div className="space-y-0">
      {displayDays.map((day) => {
        const dayEntries = groupedEntries[day] ?? [];
        const punchEvents = dayEntries
          .flatMap((entry) => {
            const events = [{
              id: `${entry.id}-in`,
              entry,
              at: entry.clockIn,
              direction: entry.eventType === 'break' ? 'Break start' : 'Punch in',
              lat: entry.clockInLat,
              lng: entry.clockInLng,
            }];
            if (entry.clockOut) {
              events.push({
                id: `${entry.id}-out`,
                entry,
                at: entry.clockOut,
                direction: entry.eventType === 'break' ? 'Break end' : 'Punch out',
                lat: entry.clockOutLat,
                lng: entry.clockOutLng,
              });
            }
            return events;
          })
          .sort((a, b) => b.at.localeCompare(a.at));

        if (punchEvents.length === 0) return null;

        return (
          <section key={day} className="time-day-panel py-5 first:pt-0 last:pb-0">
            <h3 className="mb-3 text-lg font-bold">{formatAtlanticDate(day)}</h3>
            <div className="space-y-2">
              {punchEvents.map((event) => {
                const job = event.entry.jobCodeId ? jobById.get(event.entry.jobCodeId) : null;
                const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
                return (
                  <div key={event.id} className="grid grid-cols-1 gap-3 rounded-md bg-card-alt p-3 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] sm:items-start">
                    <div>
                      <p className="text-sm font-bold">{formatAtlanticDateTime(event.at)}</p>
                      <span className="mt-1 inline-flex rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">{event.direction}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold">{event.entry.eventType === 'break' ? 'Break' : jobDisplayNameById(event.entry.jobCodeId, jobById, siteById)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <PunchGpsCue lat={event.lat} lng={event.lng} site={site} />
                      </div>
                    </div>
                    <button
                      className="min-h-10 rounded-md border border-input-border px-3 text-sm font-bold disabled:opacity-40"
                      type="button"
                      disabled={isPeriodApproved}
                      onClick={() => onEdit(event.entry)}
                    >
                      Edit Entry
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EntryTrustCue({ entry, profileById }: { entry: TimeEntry; profileById: Map<string, Profile> }) {
  const createdBy = entry.createdBy ? profileById.get(entry.createdBy) : null;
  const editedBy = entry.editedBy ? profileById.get(entry.editedBy) : null;
  const isManual = Boolean(entry.createdBy && entry.createdBy !== entry.userId);

  if (!isManual && !entry.editedAt) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
      {isManual && <span className="rounded-full bg-badge-neutral px-2 py-1 text-muted">Manual entry by {name(createdBy)}</span>}
      {entry.editedAt && <span className="rounded-full bg-warn-bg px-2 py-1 text-warning">Edited {formatAtlanticDateTime(entry.editedAt)}{editedBy ? ` by ${name(editedBy)}` : ''}</span>}
    </div>
  );
}

function GpsCue({ entry, jobById, siteById }: { entry: TimeEntry; jobById: Map<string, JobCode>; siteById: Map<string, JobSite> }) {
  const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : null;
  const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
  const gps = getEntryGpsVerification(entry, job, site);
  const className = gps.status === 'inside'
    ? 'bg-success-bg text-success'
    : gps.status === 'outside'
      ? 'bg-warn-bg text-warning'
      : 'bg-badge-neutral text-muted';

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
      <span className={`rounded-full px-2 py-1 ${className}`}>{gps.label}</span>
      {entry.clockInLat != null && entry.clockInLng != null && (
        <a
          className="rounded-full bg-badge-neutral px-2 py-1 text-muted transition hover:text-accent focus-visible:text-accent"
          href={googleMapsCoordinatesUrl(entry.clockInLat, entry.clockInLng)}
          rel="noreferrer"
          target="_blank"
        >
          {entry.clockInLat.toFixed(5)}, {entry.clockInLng.toFixed(5)}
        </a>
      )}
    </div>
  );
}

function PunchGpsCue({ lat, lng, site }: { lat?: number | null; lng?: number | null; site?: JobSite | null }) {
  if (lat == null || lng == null) return <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted">No GPS</span>;

  let className = 'bg-badge-neutral text-muted';
  let label = 'GPS captured';
  if (site?.latitude != null && site.longitude != null) {
    const distanceMeters = gpsDistanceMeters({ lat, lng }, { lat: site.latitude, lng: site.longitude });
    const radius = site.geofenceRadiusMeters || 250;
    className = distanceMeters <= radius ? 'bg-success-bg text-success' : 'bg-warn-bg text-warning';
    label = `${distanceMeters <= radius ? 'On site' : 'Off site'} (${Math.round(distanceMeters)}m)`;
  }

  return (
    <>
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${className}`}>{label}</span>
      <a
        className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold text-muted transition hover:text-accent focus-visible:text-accent"
        href={googleMapsCoordinatesUrl(lat, lng)}
        rel="noreferrer"
        target="_blank"
      >
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </a>
    </>
  );
}

function EntryEditor({ entry, jobSites, jobCodes, isBusy, onCancel, onSave, onDelete }: { entry: TimeEntry; jobSites: JobSite[]; jobCodes: JobCode[]; isBusy: boolean; onCancel: () => void; onSave: (patch: Partial<Pick<TimeEntry, 'jobCodeId' | 'clockIn' | 'clockOut' | 'notes'>>) => void; onDelete: () => void }) {
  const [jobCodeId, setJobCodeId] = useState(entry.jobCodeId ?? '');
  const [clockIn, setClockIn] = useState(formatAtlanticDateTimeInput(entry.clockIn));
  const [clockOut, setClockOut] = useState(entry.clockOut ? formatAtlanticDateTimeInput(entry.clockOut) : '');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <FormModal onClose={onCancel}>
      <FormBox title="Edit time entry" helperText="These fields load from the original punch record in Atlantic time. Change only the part that needs correction." isBusy={isBusy} requireJobCode={entry.eventType === 'work'} requireNotes={false} onCancel={onCancel} onSave={() => onSave({ jobCodeId: jobCodeId || null, clockIn: parseAtlanticDateTimeInput(clockIn), clockOut: clockOut ? parseAtlanticDateTimeInput(clockOut) : null, notes })} submitLabel="Save Entry" jobSites={jobSites} jobCodes={jobCodes} jobCodeId={jobCodeId} setJobCodeId={setJobCodeId} clockIn={clockIn} setClockIn={setClockIn} clockOut={clockOut} setClockOut={setClockOut} notes={notes} setNotes={setNotes} />
      <div className="border-t border-app-border-subtle px-4 pb-4 pt-3">
        {!confirmDelete && (
          <button className="min-h-10 rounded-md border border-error-border px-4 text-sm font-bold text-error-text disabled:opacity-60" type="button" disabled={isBusy} onClick={() => setConfirmDelete(true)}>Delete Entry</button>
        )}
        {confirmDelete && (
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-error-text">Permanently delete this entry?</p>
            <button className="min-h-10 rounded-md bg-warning px-4 text-sm font-bold text-white disabled:opacity-60" type="button" disabled={isBusy} onClick={onDelete}>Yes, delete</button>
            <button className="min-h-10 rounded-md border border-input-border px-4 text-sm font-bold" type="button" disabled={isBusy} onClick={() => setConfirmDelete(false)}>No</button>
          </div>
        )}
      </div>
    </FormModal>
  );
}

function ManualEntryForm({ employee, jobSites, jobCodes, isBusy, onCancel, onSave }: { employee: Profile; jobSites: JobSite[]; jobCodes: JobCode[]; isBusy: boolean; onCancel: () => void; onSave: (values: { jobCodeId: string | null; eventType: TimeEntry['eventType']; clockIn: string; clockOut: string | null; notes: string }) => void }) {
  const [eventType, setEventType] = useState<TimeEntry['eventType']>('work');
  const [jobCodeId, setJobCodeId] = useState(jobCodes[0]?.id ?? '');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [breakDurationMinutes, setBreakDurationMinutes] = useState('30');
  const [notes, setNotes] = useState('');
  const isBreak = eventType === 'break';
  const breakDuration = Number(breakDurationMinutes);
  const hasValidBreakDuration = !isBreak || (Number.isFinite(breakDuration) && breakDuration > 0);

  useEffect(() => {
    if (isBreak && !notes) setNotes('Break');
    if (!isBreak && notes === 'Break') setNotes('');
  }, [isBreak, notes]);

  const handleSave = () => {
    const clockInIso = parseAtlanticDateTimeInput(clockIn);
    const clockOutIso = isBreak ? new Date(new Date(clockInIso).getTime() + breakDuration * 60_000).toISOString() : clockOut ? parseAtlanticDateTimeInput(clockOut) : null;
    onSave({ eventType, jobCodeId: isBreak ? null : jobCodeId, clockIn: clockInIso, clockOut: clockOutIso, notes });
  };

  return (
    <FormModal onClose={onCancel}>
      <FormBox
        title={`Manual entry for ${employee.firstName}`}
        helperText={isBreak ? 'Create a completed admin-entered break in Atlantic time.' : 'Create a new admin-entered work entry in Atlantic time. Leave punch out blank to create an open shift.'}
        isBusy={isBusy}
        requireJobCode={!isBreak}
        requireClockOut={false}
        requireNotes={false}
        onCancel={onCancel}
        onSave={handleSave}
        submitLabel={isBreak ? 'Add Break' : 'Add Entry'}
        jobSites={jobSites}
        jobCodes={jobCodes}
        jobCodeId={jobCodeId}
        setJobCodeId={setJobCodeId}
        clockIn={clockIn}
        setClockIn={setClockIn}
        clockOut={clockOut}
        setClockOut={setClockOut}
        notes={notes}
        setNotes={setNotes}
        entryTypeControl={<EntryTypeControl value={eventType} onChange={setEventType} />}
        clockInLabel={isBreak ? 'Break start' : 'Punch in'}
        clockOutLabel={isBreak ? 'Break end' : 'Punch out'}
        timeSectionLabel={isBreak ? 'Break time' : 'Punch times'}
        notesLabel={isBreak ? 'Break note' : 'Description / shift note'}
        extraSaveDisabled={isBreak && !hasValidBreakDuration}
        validationMessage={isBreak && !hasValidBreakDuration ? 'Enter a break duration greater than 0 minutes.' : null}
        timeFields={isBreak ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-muted">
              Break start
              <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border bg-card px-3" type="datetime-local" value={clockIn} onChange={(event) => setClockIn(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Duration
              <div className="mt-1.5 flex min-h-12 items-center rounded-md border border-input-border bg-card">
                <input className="min-h-12 min-w-0 flex-1 rounded-md bg-transparent px-3 text-base outline-none" type="number" inputMode="numeric" min="1" step="1" value={breakDurationMinutes} onChange={(event) => setBreakDurationMinutes(event.target.value)} />
                <span className="pr-3 text-sm font-bold text-muted">minutes</span>
              </div>
            </label>
          </div>
        ) : undefined}
      />
    </FormModal>
  );
}

function EntryTypeControl({ value, onChange }: { value: TimeEntry['eventType']; onChange: (value: TimeEntry['eventType']) => void }) {
  return (
    <div className="rounded-md border border-app-border-subtle bg-card-alt p-3">
      <p className="text-sm font-bold text-muted-strong">Entry type</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          className={`min-h-12 rounded-md border px-4 text-left font-bold transition ${value === 'work' ? 'border-accent bg-badge-neutral text-ink' : 'border-input-border text-muted hover:text-ink'}`}
          type="button"
          onClick={() => onChange('work')}
          aria-pressed={value === 'work'}
        >
          Work
          <span className="mt-1 block text-xs font-semibold text-muted">Job time or open shift</span>
        </button>
        <button
          className={`min-h-12 rounded-md border px-4 text-left font-bold transition ${value === 'break' ? 'border-accent bg-badge-neutral text-ink' : 'border-input-border text-muted hover:text-ink'}`}
          type="button"
          onClick={() => onChange('break')}
          aria-pressed={value === 'break'}
        >
          Break
          <span className="mt-1 block text-xs font-semibold text-muted">Manual lunch or break period</span>
        </button>
      </div>
    </div>
  );
}

function FormModal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-end overflow-hidden bg-black/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-md bg-card shadow-soft sm:mx-auto sm:max-h-[92vh] sm:max-w-2xl">
        {onClose && (
          <div className="flex justify-end px-4 pt-3">
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-card-alt hover:text-ink" type="button" aria-label="Close" onClick={onClose}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function FormBox(props: { title: string; helperText?: string; isBusy: boolean; requireJobCode: boolean; requireClockOut?: boolean; requireNotes: boolean; onCancel: () => void; onSave: () => void; submitLabel: string; jobSites: JobSite[]; jobCodes: JobCode[]; jobCodeId: string; setJobCodeId: (value: string) => void; clockIn: string; setClockIn: (value: string) => void; clockOut: string; setClockOut: (value: string) => void; notes: string; setNotes: (value: string) => void; entryTypeControl?: ReactNode; clockInLabel?: string; clockOutLabel?: string; timeSectionLabel?: string; notesLabel?: string; timeFields?: ReactNode; extraSaveDisabled?: boolean; validationMessage?: ReactNode }) {
  const hasInvalidRange = Boolean(props.clockIn && props.clockOut && new Date(parseAtlanticDateTimeInput(props.clockOut)).getTime() <= new Date(parseAtlanticDateTimeInput(props.clockIn)).getTime());
  const isIncomplete = (props.requireJobCode && !props.jobCodeId) || !props.clockIn || (props.requireClockOut && !props.clockOut) || (props.requireNotes && !props.notes.trim());
  const isSaveDisabled = props.isBusy || isIncomplete || hasInvalidRange || Boolean(props.extraSaveDisabled);
  const siteById = jobSiteById(props.jobSites);

  return (
    <div className="rounded-md border border-app-border bg-card shadow-soft">
      <div className="border-b border-app-border-subtle p-4">
      <h3 className="text-lg font-bold">{props.title}</h3>
        {props.helperText && <p className="mt-1 text-sm font-semibold text-muted">{props.helperText}</p>}
      </div>
      <div className="space-y-4 p-4">
        {props.entryTypeControl}
        {props.requireJobCode && (
          <div className="rounded-md border border-app-border-subtle bg-card-alt p-3">
            <label className="block text-sm font-semibold text-muted">
              Job code
              <select className="mt-1.5 min-h-12 w-full rounded-md border border-input-border bg-card px-3" value={props.jobCodeId} onChange={(event) => props.setJobCodeId(event.target.value)}>
                {props.jobCodes.map((job) => <option key={job.id} value={job.id}>{jobDisplayName(job, job.jobSiteId ? siteById.get(job.jobSiteId) : null)}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="rounded-md border border-app-border-subtle bg-card-alt p-3">
          <p className="text-sm font-bold text-muted-strong">{props.timeSectionLabel || 'Punch times'}</p>
          {props.timeFields ?? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-muted">
                {props.clockInLabel || 'Punch in'}
                <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border bg-card px-3" type="datetime-local" value={props.clockIn} onChange={(event) => props.setClockIn(event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-muted">
                {props.clockOutLabel || 'Punch out'}
                <input className="mt-1.5 min-h-12 w-full rounded-md border border-input-border bg-card px-3" type="datetime-local" value={props.clockOut} onChange={(event) => props.setClockOut(event.target.value)} />
              </label>
            </div>
          )}
        </div>
        <div className="rounded-md border border-app-border-subtle bg-card-alt p-3">
          <label className="block text-sm font-semibold text-muted">
            {props.notesLabel || 'Description / shift note'}
            <textarea className="mt-1.5 min-h-24 w-full rounded-md border border-input-border bg-card p-3 text-base" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Optional shift note" />
          </label>
        </div>
      </div>
      {hasInvalidRange && <p className="mx-4 rounded-md bg-error-bg p-3 text-sm font-semibold text-error-text">Punch out must be after punch in.</p>}
      {props.requireClockOut && !props.clockOut && <p className="mx-4 rounded-md bg-card-alt p-3 text-sm font-semibold text-muted">Break entries need a punch out time.</p>}
      {props.requireNotes && !props.notes.trim() && <p className="mx-4 rounded-md bg-card-alt p-3 text-sm font-semibold text-muted">Manual entries need a short note.</p>}
      {props.validationMessage && <p className="mx-4 rounded-md bg-card-alt p-3 text-sm font-semibold text-muted">{props.validationMessage}</p>}
      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        <button className="min-h-12 rounded-md border border-input-border px-4 font-bold" type="button" onClick={props.onCancel}>Cancel</button>
        <button className="min-h-12 rounded-md bg-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={isSaveDisabled} onClick={props.onSave}>{props.submitLabel}</button>
      </div>
    </div>
  );
}

function name(profile?: Profile | null) {
  return profile ? `${profile.firstName} ${profile.lastName}` : 'unknown admin';
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-card-alt p-3"><dt className="font-semibold text-muted">{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>;
}
