import { useEffect, useMemo, useState } from 'react';
import { AlarmClock } from 'lucide-react';
import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import type { TimeClockService } from '../services/TimeClockService';
import { requestGpsPoint } from '../utils/gps';
import { employeeJobDisplayName, getEntryGpsVerification, isSelectableJobCode, isSelectableJobSite, jobCodeLabel, jobSiteById } from '../utils/jobs';
import { computeTimeSummary } from '../utils/timecardHours';
import { formatAtlanticDateTime, formatAtlanticTime, formatDuration, getAtlanticDateKey, getEntryDurationHours } from '../utils/time';

interface ClockScreenProps {
  profile: Profile;
  service: TimeClockService;
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  openWorkEntry: TimeEntry | null;
  openBreakEntry: TimeEntry | null;
  payPeriodSettings: PayPeriodSettings;
  onDataChange: () => Promise<void>;
}

const unassignedPropertyId = '__unassigned__';

export function ClockScreen({ profile, service, jobSites, jobCodes, entries, openWorkEntry, openBreakEntry, payPeriodSettings, onDataChange }: ClockScreenProps) {
  const selectableJobs = useMemo(() => jobCodes.filter(isSelectableJobCode), [jobCodes]);
  const firstSelectableJob = selectableJobs[0] ?? null;
  const [selectedPropertyId, setSelectedPropertyId] = useState(firstSelectableJob?.jobSiteId ?? unassignedPropertyId);
  const [selectedJobId, setSelectedJobId] = useState(firstSelectableJob?.id ?? '');
  const [switchPropertyId, setSwitchPropertyId] = useState(selectableJobs[1]?.jobSiteId ?? firstSelectableJob?.jobSiteId ?? unassignedPropertyId);
  const [switchJobId, setSwitchJobId] = useState(selectableJobs[1]?.id ?? firstSelectableJob?.id ?? '');
  const [shiftNotes, setShiftNotes] = useState(openWorkEntry?.notes ?? '');
  const [switchNote, setSwitchNote] = useState('');
  const [isSwitchMenuOpen, setIsSwitchMenuOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState('GPS will be captured when you punch.');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => jobSiteById(jobSites), [jobSites]);
  const selectableSites = useMemo(() => jobSites.filter(isSelectableJobSite), [jobSites]);
  const propertyOptions = useMemo(() => {
    const siteIdsWithJobs = new Set(selectableJobs.map((job) => job.jobSiteId ?? unassignedPropertyId));
    const siteOptions = selectableSites
      .filter((site) => siteIdsWithJobs.has(site.id))
      .map((site) => ({ id: site.id, name: site.name }));
    if (siteIdsWithJobs.has(unassignedPropertyId)) siteOptions.push({ id: unassignedPropertyId, name: 'No property' });
    return siteOptions;
  }, [selectableJobs, selectableSites]);
  const jobsForProperty = (propertyId: string) => selectableJobs.filter((job) => (job.jobSiteId ?? unassignedPropertyId) === propertyId);
  const selectedPropertyJobs = jobsForProperty(selectedPropertyId);
  const switchPropertyJobs = jobsForProperty(switchPropertyId);
  const activeJob = openWorkEntry?.jobCodeId ? jobById.get(openWorkEntry.jobCodeId) : null;
  const activeSite = activeJob?.jobSiteId ? siteById.get(activeJob.jobSiteId) : null;
  const todayKey = getAtlanticDateKey(now);
  const todaysEntries = entries.filter((entry) => getAtlanticDateKey(entry.clockIn) === todayKey).sort((a, b) => b.clockIn.localeCompare(a.clockIn));
  const todaySummary = computeTimeSummary(todaysEntries, profile, payPeriodSettings.weeklyOvertimeThresholdHours, now);
  const finalClockOutNote = shiftNotes.trim();

  useEffect(() => {
    if (selectableJobs.length === 0) {
      setSelectedJobId('');
      setSwitchJobId('');
      return;
    }
    if (!selectableJobs.some((job) => job.id === selectedJobId)) {
      const fallback = selectableJobs[0];
      setSelectedPropertyId(fallback.jobSiteId ?? unassignedPropertyId);
      setSelectedJobId(fallback.id);
    }
    if (!selectableJobs.some((job) => job.id === switchJobId)) {
      const fallback = selectableJobs[1] ?? selectableJobs[0];
      setSwitchPropertyId(fallback.jobSiteId ?? unassignedPropertyId);
      setSwitchJobId(fallback.id);
    }
  }, [selectableJobs, selectedJobId, switchJobId]);

  useEffect(() => {
    const jobs = jobsForProperty(selectedPropertyId);
    if (jobs.length > 0 && !jobs.some((job) => job.id === selectedJobId)) setSelectedJobId(jobs[0].id);
  }, [selectedPropertyId, selectedJobId, selectableJobs]);

  useEffect(() => {
    const jobs = jobsForProperty(switchPropertyId);
    if (jobs.length > 0 && !jobs.some((job) => job.id === switchJobId)) setSwitchJobId(jobs[0].id);
  }, [switchPropertyId, switchJobId, selectableJobs]);

  useEffect(() => setShiftNotes(openWorkEntry?.notes ?? ''), [openWorkEntry?.id, openWorkEntry?.notes]);
  useEffect(() => setIsSwitchMenuOpen(false), [openWorkEntry?.id]);

  const captureGps = async () => {
    setGpsStatus('Capturing GPS...');
    const gps = await requestGpsPoint();
    setGpsStatus(gpsStatusLabel(gps.status));
    return gps;
  };

  const runAction = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      await onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col rounded-md border border-app-border bg-card shadow-soft lg:min-h-full">
        {/* Status header */}
        <div className="p-5 pb-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">{formatAtlanticDateTime(now)}</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight">
                {openBreakEntry ? `On break - ${employeeJobDisplayName(activeJob, activeSite)}` : openWorkEntry ? `Clocked in - ${employeeJobDisplayName(activeJob, activeSite)}` : "You're clocked out"}
              </h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${openBreakEntry ? 'bg-warn-bg text-warning' : openWorkEntry ? 'bg-success-bg text-success' : 'bg-badge-neutral text-muted'}`}>
              {openBreakEntry ? 'Break' : openWorkEntry ? 'Working' : 'Out'}
            </span>
          </div>
          <div className="mt-4 rounded-md bg-card-alt p-4">
            <p className="text-sm font-semibold text-muted">{openBreakEntry ? 'Break timer' : openWorkEntry ? 'Current job timer' : 'Today net hours'}</p>
            <p className="mt-1 font-mono text-4xl font-bold leading-none">
              {openBreakEntry ? formatDuration(getEntryDurationHours(openBreakEntry, now) * 3600) : openWorkEntry ? formatDuration(getEntryDurationHours(openWorkEntry, now) * 3600) : `${todaySummary.netWorkHours.toFixed(2)}h`}
            </p>
            {openWorkEntry && <p className="mt-2 text-sm text-muted">Clocked in at {formatAtlanticTime(openWorkEntry.clockIn)}</p>}
          </div>
        </div>

        {error && <div className="mx-5 mt-4 rounded-md border border-error-border bg-error-bg p-3 text-sm font-semibold text-error-text">{error}</div>}

        {/* Clock controls */}
        <div className="flex flex-1 flex-col p-5">
          {!openWorkEntry && (
            <>
              <label className="text-sm font-semibold text-muted" htmlFor="property-select">Property</label>
              <select id="property-select" className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>
                {propertyOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
              <label className="mt-3 text-sm font-semibold text-muted" htmlFor="job-select">Job code</label>
              <select id="job-select" className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
                {selectedPropertyJobs.map((job) => <option key={job.id} value={job.id}>{jobCodeLabel(job)}</option>)}
              </select>
              <button className="mt-4 inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-lg font-bold text-white disabled:opacity-60" type="button" onClick={() => runAction(async () => { const gps = await captureGps(); await service.clockIn({ userId: profile.id, jobCodeId: selectedJobId, at: new Date().toISOString(), gps }); })} disabled={isBusy || !selectedJobId}>
                <AlarmClock size={22} aria-hidden="true" />
                Clock In
              </button>
              <p className="mt-2 text-center text-xs text-muted-light">GPS coordinates will be captured</p>
            </>
          )}

          {openWorkEntry && (
            <div className="grid grid-cols-1 gap-3">
              {openBreakEntry ? (
                <button className="min-h-16 rounded-md bg-accent px-4 text-lg font-bold text-white disabled:opacity-60" type="button" onClick={() => runAction(async () => { const gps = await captureGps(); await service.endBreak({ entryId: openBreakEntry.id, at: new Date().toISOString(), gps }); })} disabled={isBusy}>End Break</button>
              ) : (
                <button className="min-h-14 rounded-md border border-accent px-4 font-bold text-accent disabled:opacity-60" type="button" onClick={() => runAction(async () => { const gps = await captureGps(); await service.startBreak({ userId: profile.id, jobCodeId: openWorkEntry.jobCodeId ?? selectedJobId, at: new Date().toISOString(), gps }); })} disabled={isBusy}>Start Break</button>
              )}

              {!openBreakEntry && (
                <button className="min-h-12 rounded-md border border-input-border px-4 font-bold text-muted-strong disabled:opacity-50" type="button" onClick={() => { setSwitchNote(''); setIsSwitchMenuOpen(!isSwitchMenuOpen); }} disabled={isBusy}>
                  {isSwitchMenuOpen ? 'Cancel Switch' : 'Switch Jobs'}
                </button>
              )}

              {isSwitchMenuOpen && !openBreakEntry && (
                <div className="rounded-md border border-app-border bg-card-alt p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-muted">
                      Property
                      <select className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3" value={switchPropertyId} onChange={(event) => setSwitchPropertyId(event.target.value)}>
                        {propertyOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-muted">
                      Job code
                      <select className="mt-1.5 min-h-11 w-full rounded-md border border-input-border bg-card px-3" value={switchJobId} onChange={(event) => setSwitchJobId(event.target.value)}>
                        {switchPropertyJobs.map((job) => <option key={job.id} value={job.id}>{jobCodeLabel(job)}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="mt-2 block text-sm font-semibold text-muted">
                    Note for the job you're leaving
                    <textarea className="mt-1.5 min-h-20 w-full rounded-md border border-input-border bg-card p-3 text-base" value={switchNote} onChange={(event) => setSwitchNote(event.target.value)} placeholder="Required before switching" />
                  </label>
                  <button className="mt-3 min-h-11 w-full rounded-md bg-accent px-4 font-bold text-white disabled:opacity-50" type="button" onClick={() => runAction(async () => { const gps = await captureGps(); await service.switchJob({ userId: profile.id, fromEntryId: openWorkEntry.id, toJobCodeId: switchJobId, at: new Date().toISOString(), gps, note: switchNote }); setSwitchNote(''); setIsSwitchMenuOpen(false); })} disabled={isBusy || !switchJobId || !switchNote.trim()}>Confirm Switch</button>
                </div>
              )}

              <label className="text-sm font-semibold text-muted" htmlFor="shift-notes">Shift notes</label>
              <textarea id="shift-notes" className="min-h-28 rounded-md border border-input-border bg-card p-3" value={shiftNotes} onChange={(event) => setShiftNotes(event.target.value)} placeholder="Required before clocking out" />
              <p className="text-xs font-semibold text-muted">Shift notes are mandatory before clocking out.</p>
              <button className="min-h-16 rounded-md bg-red-700 px-4 text-lg font-bold text-white disabled:opacity-60" type="button" onClick={() => runAction(async () => { const gps = await captureGps(); const at = new Date().toISOString(); if (openBreakEntry) await service.endBreak({ entryId: openBreakEntry.id, at, gps }); await service.clockOut({ entryId: openWorkEntry.id, at, gps, notes: finalClockOutNote }); })} disabled={isBusy || !finalClockOutNote}>Clock Out</button>
              <p className="text-center text-xs text-muted-light">GPS coordinates will be captured</p>
            </div>
          )}
        </div>
      </div>

      <aside className="rounded-md border border-app-border bg-card p-4 shadow-soft lg:self-stretch">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Today's log</h3>
          <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">{todaySummary.netWorkHours.toFixed(2)}h net</span>
        </div>
        <div className="mt-4 space-y-3">
          {todaysEntries.length === 0 && <p className="text-sm text-muted">No entries yet today.</p>}
          {todaysEntries.map((entry) => {
            const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : null;
            const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
            const gps = getEntryGpsVerification(entry, job, site);
            const missingGps = !entry.clockInLat || (entry.clockOut && !entry.clockOutLat);
            return (
              <div key={entry.id} className="rounded-md border border-app-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{entry.eventType === 'break' ? 'Break' : employeeJobDisplayName(job, site)}</p>
                    <p className="text-sm text-muted">{formatAtlanticTime(entry.clockIn)} – {entry.clockOut ? formatAtlanticTime(entry.clockOut) : 'In progress'}</p>
                  </div>
                  <span className="rounded-full bg-badge-neutral px-2 py-1 text-xs font-bold">{getEntryDurationHours(entry, now).toFixed(2)}h</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-badge-neutral px-2 py-1 capitalize">{entry.eventType}</span>
                  <span className={`rounded-full px-2 py-1 ${gps.status === 'inside' ? 'bg-success-bg text-success' : gps.status === 'outside' ? 'bg-warn-bg text-warning' : 'bg-badge-neutral text-muted'}`}>{gps.label}</span>
                  {missingGps && <span className="rounded-full bg-warn-bg px-2 py-1 text-warning">No GPS</span>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </section>
  );
}

function gpsStatusLabel(status: string) {
  if (status === 'captured') return 'GPS captured for the last punch.';
  if (status === 'denied') return 'GPS permission was denied. The punch was saved without location.';
  if (status === 'unsupported') return 'GPS is not supported in this browser. The punch was saved without location.';
  return 'GPS was unavailable. The punch was saved without location.';
}
