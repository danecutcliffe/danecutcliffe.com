import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { getEntryGpsVerification, jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { computeTimeSummary } from '../utils/timecardHours';
import { addDaysToDateKey, formatAtlanticDate, formatAtlanticDateTime, formatAtlanticTime, formatDurationCompact, getAtlanticDateKey, getEntryDurationHours } from '../utils/time';
import { getWorkdayProgress, getWorkdayProjectionFactor } from '../utils/workdayProjection';

interface AdminDashboardProps {
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  payPeriodSettings: PayPeriodSettings;
  onOpenTimesheets?: (employeeId: string) => void;
}

type FlagSeverity = 'blocker' | 'review';

interface ReviewFlag {
  id: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
  entry?: TimeEntry;
}

interface WorkingNowItem {
  employee: Profile;
  state: 'working' | 'break';
  workEntry?: TimeEntry;
  breakEntry?: TimeEntry;
  jobLabel: string;
}

export function AdminDashboard({ profiles, jobSites, jobCodes, entries, payPeriodSettings, onOpenTimesheets }: AdminDashboardProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const [isAttentionOpen, setIsAttentionOpen] = useState(true);
  const periodEnd = addDaysToDateKey(periodStart, payPeriodSettings.lengthDays - 1);
  const appStorageScope = typeof window === 'undefined' ? 'server' : `${window.location.host}:${window.location.pathname}`;
  const dismissalStorageKey = `time-admin-attention-dismissed:${appStorageScope}:${periodStart}:${periodEnd}`;
  const [dismissedFlagIds, setDismissedFlagIds] = useState<string[]>([]);
  const now = new Date();
  const todayKey = getAtlanticDateKey(now);
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => jobSiteById(jobSites), [jobSites]);
  const employees = profiles.filter((profile) => profile.role === 'employee');
  const periodEntries = entries.filter((entry) => {
    const key = getAtlanticDateKey(entry.clockIn);
    return key >= periodStart && key <= periodEnd;
  });
  const periodSummary = employees.reduce(
    (total, employee) => {
      const employeeEntries = periodEntries.filter((entry) => entry.userId === employee.id);
      const summary = computeTimeSummary(employeeEntries, employee, payPeriodSettings.weeklyOvertimeThresholdHours);
      return {
        netWorkHours: total.netWorkHours + summary.netWorkHours,
        overtimeHours: total.overtimeHours + summary.overtimeHours,
        paidBreakHours: total.paidBreakHours + summary.paidBreakHours,
        unpaidBreakHours: total.unpaidBreakHours + summary.unpaidBreakHours,
        grossPay: total.grossPay + summary.grossPay,
      };
    },
    { netWorkHours: 0, overtimeHours: 0, paidBreakHours: 0, unpaidBreakHours: 0, grossPay: 0 },
  );
  const flags = buildReviewFlags({ entries: periodEntries, profileById, jobById, siteById });
  const dismissedFlagIdSet = useMemo(() => new Set(dismissedFlagIds), [dismissedFlagIds]);
  const visibleFlags = useMemo(() => flags.filter((flag) => !dismissedFlagIdSet.has(flagDismissalKey(flag))), [dismissedFlagIdSet, flags]);
  const hiddenFlags = useMemo(() => flags.filter((flag) => dismissedFlagIdSet.has(flagDismissalKey(flag))), [dismissedFlagIdSet, flags]);
  const dismissedFlagCount = flags.length - visibleFlags.length;
  const visibleBlockerCount = visibleFlags.filter((flag) => flag.severity === 'blocker').length;
  const visibleReviewCount = visibleFlags.length - visibleBlockerCount;
  const hiddenBlockerCount = hiddenFlags.filter((flag) => flag.severity === 'blocker').length;
  const hiddenReviewCount = hiddenFlags.length - hiddenBlockerCount;
  const workdayProgress = getWorkdayProgress(periodStart, payPeriodSettings.lengthDays, now);
  const projectionFactor = getWorkdayProjectionFactor(workdayProgress);
  const projectedPayroll = periodSummary.grossPay * projectionFactor;
  const workingNowItems = useMemo(() => buildWorkingNowItems({ entries, employees, jobById, siteById }), [employees, entries, jobById, siteById]);

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
  }, [currentPeriod.start, payPeriodSettings.lengthDays]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(dismissalStorageKey) ?? '[]');
      setDismissedFlagIds(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
    } catch {
      setDismissedFlagIds([]);
    }
  }, [dismissalStorageKey]);

  const dismissFlag = (flag: ReviewFlag) => {
    setDismissedFlagIds((current) => {
      const dismissalKey = flagDismissalKey(flag);
      const next = current.includes(dismissalKey) ? current : [...current, dismissalKey];
      try {
        localStorage.setItem(dismissalStorageKey, JSON.stringify(next));
      } catch {
        // If browser storage is unavailable, still hide it for this session.
      }
      return next;
    });
  };

  const restoreDismissedFlags = () => {
    try {
      localStorage.removeItem(dismissalStorageKey);
    } catch {
      // Browser storage can be unavailable in private or locked-down contexts.
    }
    setDismissedFlagIds([]);
  };

  return (
    <section className="space-y-4">
      <Panel id="working-now" title="Working now">
        {workingNowItems.length === 0 && <p className="text-sm text-muted">No one is currently clocked in.</p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {workingNowItems.map((item) => (
            <WorkingNowCard key={item.employee.id} item={item} onOpenTimesheets={onOpenTimesheets} />
          ))}
        </div>
      </Panel>

      <Panel id="pay-period-snapshot" title="Pay period snapshot">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight">Current pay period</h3>
            <p className="mt-1 text-sm text-muted">
              {formatAtlanticDate(periodStart)} - {formatAtlanticDate(periodEnd)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, -payPeriodSettings.lengthDays))}>Previous</button>
            <button className="min-h-12 rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, payPeriodSettings.lengthDays))}>Next</button>
            <button className="col-span-2 min-h-12 rounded-md bg-accent px-3 font-bold text-white" type="button" onClick={() => setPeriodStart(currentPeriod.start)}>Current Period</button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
            <span>{formatWorkdayCount(workdayProgress.elapsedWorkdays)} of {workdayProgress.totalWorkdays} workdays elapsed</span>
            <span>{workdayProgress.percent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-badge-neutral">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${workdayProgress.percent}%` }} />
          </div>
        </div>

        <div id="metrics" className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total accrued payroll this period" value={money(periodSummary.grossPay)} sublabel={lunchSummaryLabel(periodSummary.paidBreakHours, periodSummary.unpaidBreakHours)} />
          <Metric label="Projected total payroll this period" value={money(projectedPayroll)} sublabel={projectionLabel(workdayProgress, projectionFactor)} />
          <Metric label="Payable hours" value={`${periodSummary.netWorkHours.toFixed(1)}h`} />
          <Metric label="Needs review" value={visibleFlags.length.toString()} sublabel={`${visibleBlockerCount} visible blockers, ${visibleReviewCount} visible review${dismissedFlagCount ? `, ${hiddenBlockerCount} hidden blockers, ${hiddenReviewCount} hidden review` : ''}`} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4">
        <Panel id="employee-review" title="Employee review">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {employees.map((employee) => (
              <EmployeeReviewCard
                key={employee.id}
                employee={employee}
                entries={periodEntries.filter((entry) => entry.userId === employee.id)}
                flags={flags.filter((flag) => flag.entry?.userId === employee.id)}
                jobById={jobById}
                siteById={siteById}
                weeklyOvertimeThresholdHours={payPeriodSettings.weeklyOvertimeThresholdHours}
                onOpenTimesheets={onOpenTimesheets}
              />
            ))}
          </div>
        </Panel>

        <Panel
          id="needs-review"
          title="Needs Review"
          action={(
            <button className="min-h-9 rounded-md border border-input-border px-3 text-sm font-bold text-muted-strong" type="button" onClick={() => setIsAttentionOpen(!isAttentionOpen)}>
              {isAttentionOpen ? 'Collapse' : 'Expand'}
            </button>
          )}
        >
          {isAttentionOpen && (
            <>
              {flags.length === 0 && <p className="text-sm text-muted">No items need review for this pay period.</p>}
              {flags.length > 0 && visibleFlags.length === 0 && (
                <p className="rounded-md border border-app-border bg-card-alt p-3 text-sm font-semibold text-muted-strong">
                  All review items for this pay period are hidden.
                </p>
              )}
              <div className="space-y-2">
                {visibleFlags.slice(0, 10).map((flag) => (
                  <div key={flag.id} className={`rounded-md border p-3 text-sm ${flag.severity === 'blocker' ? 'border-error-border bg-error-bg' : 'border-warn-border bg-warn-bg'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className={`font-bold ${flag.severity === 'blocker' ? 'text-error-text' : 'text-warning'}`}>{flag.title}</p>
                      <button
                        aria-label={`Hide ${flag.title}`}
                        className="min-h-7 min-w-7 rounded-full border border-current px-2 text-xs font-bold opacity-80 hover:opacity-100"
                        type="button"
                        onClick={() => dismissFlag(flag)}
                      >
                        X
                      </button>
                    </div>
                    <p className="mt-1 text-muted-strong">{flag.detail}</p>
                  </div>
                ))}
              </div>
              {dismissedFlagCount > 0 && (
                <button className="min-h-9 rounded-md border border-input-border px-3 text-sm font-bold text-muted-strong" type="button" onClick={restoreDismissedFlags}>
                  Show {dismissedFlagCount} hidden item{dismissedFlagCount === 1 ? '' : 's'}
                </button>
              )}
            </>
          )}
          {!isAttentionOpen && <p className="text-sm text-muted">{visibleFlags.length} visible review item{visibleFlags.length === 1 ? '' : 's'} hidden.</p>}
        </Panel>
      </div>

    </section>
  );
}

function EmployeeReviewCard({ employee, entries, flags, jobById, siteById, weeklyOvertimeThresholdHours, onOpenTimesheets }: { employee: Profile; entries: TimeEntry[]; flags: ReviewFlag[]; jobById: Map<string, JobCode>; siteById: Map<string, JobSite>; weeklyOvertimeThresholdHours: number; onOpenTimesheets?: (employeeId: string) => void }) {
  const summary = computeTimeSummary(entries, employee, weeklyOvertimeThresholdHours);
  const lastEntry = [...entries].sort((a, b) => b.clockIn.localeCompare(a.clockIn))[0];
  const jobSplits = getJobSplits(entries, jobById, siteById, employee);
  return (
    <div className="min-w-0 rounded-md border border-app-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-lg font-bold">{name(employee)}</p>
          <p className="text-sm text-muted">{lastEntry ? `Last punch ${formatAtlanticTime(lastEntry.clockIn)}` : 'No time this period'}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${flags.length ? 'bg-warn-bg text-warning' : 'bg-success-bg text-success'}`}>
          {flags.length ? `${flags.length} flags` : 'Clean'}
        </span>
      </div>
      <p className="mt-2 text-xs font-bold text-muted">{employee.paidBreaks ? `${employee.paidBreakMinutes} paid lunch minutes` : 'Unpaid lunches'}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <MiniMetric label="Payable" value={`${summary.netWorkHours.toFixed(1)}h`} />
        <MiniMetric label="OT" value={`${summary.overtimeHours.toFixed(1)}h`} />
        <MiniMetric label="Entries" value={entries.length.toString()} />
        <MiniMetric label="Gross" value={money(summary.grossPay)} />
      </div>
      <div className="mt-3 space-y-1">
        {jobSplits.length === 0 && <p className="text-sm text-muted">No job allocation yet.</p>}
        {jobSplits.slice(0, 3).map((split) => (
          <div key={split.name} className="flex min-w-0 items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted">{split.name}</span>
            <span className="font-bold">{split.hours.toFixed(1)}h</span>
          </div>
        ))}
      </div>
      {onOpenTimesheets && (
        <button className="mt-3 min-h-11 w-full rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={() => onOpenTimesheets(employee.id)}>
          Review Timesheet
        </button>
      )}
    </div>
  );
}

function WorkingNowCard({ item, onOpenTimesheets }: { item: WorkingNowItem; onOpenTimesheets?: (employeeId: string) => void }) {
  const activeEntry = item.state === 'break' ? item.breakEntry : item.workEntry;
  const activeHours = activeEntry ? getEntryDurationHours(activeEntry) : 0;
  const workHours = item.workEntry ? getEntryDurationHours(item.workEntry) : 0;
  const statusClass = item.state === 'break' ? 'bg-warn-bg text-warning' : 'bg-success-bg text-success';

  return (
    <div className="min-w-0 rounded-md border border-app-border bg-card-alt p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-lg font-bold">{name(item.employee)}</p>
          <p className="break-words text-sm text-muted">{item.jobLabel}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}>
          {item.state === 'break' ? 'On break' : 'Working'}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-muted-strong">
        {item.state === 'break' ? `On break for ${formatDurationCompact(activeHours)}` : `Working for ${formatDurationCompact(activeHours)}`}
      </p>
      {item.state === 'break' && item.workEntry && (
        <p className="mt-1 text-xs font-semibold text-muted">Shift open for {formatDurationCompact(workHours)}</p>
      )}
      {onOpenTimesheets && (
        <button className="mt-3 min-h-10 w-full rounded-md border border-input-border px-3 text-sm font-bold text-muted-strong" type="button" onClick={() => onOpenTimesheets(item.employee.id)}>
          Review Timesheet
        </button>
      )}
    </div>
  );
}

function buildWorkingNowItems({ entries, employees, jobById, siteById }: { entries: TimeEntry[]; employees: Profile[]; jobById: Map<string, JobCode>; siteById: Map<string, JobSite> }): WorkingNowItem[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const openEntries = entries.filter((entry) => !entry.clockOut);
  const openWorkByEmployee = new Map<string, TimeEntry[]>();
  const openBreakByEmployee = new Map<string, TimeEntry[]>();

  for (const entry of openEntries) {
    const map = entry.eventType === 'break' ? openBreakByEmployee : openWorkByEmployee;
    map.set(entry.userId, [...(map.get(entry.userId) ?? []), entry]);
  }

  const userIds = new Set([...openWorkByEmployee.keys(), ...openBreakByEmployee.keys()]);
  return [...userIds]
    .map((userId): WorkingNowItem | null => {
      const employee = employeeById.get(userId);
      if (!employee) return null;
      const workEntries = [...(openWorkByEmployee.get(userId) ?? [])].sort((a, b) => b.clockIn.localeCompare(a.clockIn));
      const breakEntry = [...(openBreakByEmployee.get(userId) ?? [])].sort((a, b) => b.clockIn.localeCompare(a.clockIn))[0];
      const workEntry = breakEntry
        ? workEntries.find((entry) => entry.clockIn <= breakEntry.clockIn) ?? workEntries[0]
        : workEntries[0];
      const state = breakEntry ? 'break' : 'working';
      const jobEntry = workEntry ?? breakEntry;
      if (!jobEntry) return null;
      return {
        employee,
        state,
        workEntry,
        breakEntry,
        jobLabel: jobDisplayNameById(jobEntry?.jobCodeId, jobById, siteById),
      };
    })
    .filter((item): item is WorkingNowItem => Boolean(item))
    .sort((a, b) => {
      const aEntry = a.state === 'break' ? a.breakEntry : a.workEntry;
      const bEntry = b.state === 'break' ? b.breakEntry : b.workEntry;
      return (aEntry?.clockIn ?? '').localeCompare(bEntry?.clockIn ?? '');
    });
}

function buildReviewFlags({ entries, profileById, jobById, siteById }: { entries: TimeEntry[]; profileById: Map<string, Profile>; jobById: Map<string, JobCode>; siteById: Map<string, JobSite> }): ReviewFlag[] {
  return entries.flatMap((entry) => {
    const employee = profileById.get(entry.userId);
    const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : null;
    const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
    const gps = getEntryGpsVerification(entry, job, site);
    const employeeName = name(employee);
    const flags: ReviewFlag[] = [];

    if (!entry.clockOut) {
      const openHours = (Date.now() - new Date(entry.clockIn).getTime()) / 3_600_000;
      if (openHours >= 12) flags.push({ id: `${entry.id}-open`, severity: 'blocker', title: 'Stale open entry', detail: `${employeeName} has had an open ${entry.eventType} for ${Math.round(openHours)}h since ${formatAtlanticDateTime(entry.clockIn)}. Likely a forgotten clock-out.`, entry });
    }
    if (entry.eventType === 'work' && !entry.jobCodeId) flags.push({ id: `${entry.id}-job`, severity: 'blocker', title: 'Missing job code', detail: `${employeeName} has work time without a job code.`, entry });
    if (employee && employee.hourlyRate <= 0 && entry.eventType === 'work') flags.push({ id: `${entry.id}-rate`, severity: 'blocker', title: 'Missing pay rate', detail: `${employeeName} has hours but no hourly rate.`, entry });
    if (employee && !employee.isActive) flags.push({ id: `${entry.id}-inactive`, severity: 'review', title: 'Inactive employee has time', detail: `${employeeName} has time in this period.`, entry });
    const isAdminCreated = Boolean(entry.createdBy && entry.createdBy !== entry.userId);
    if (!isAdminCreated && (!entry.clockInLat || (entry.clockOut && !entry.clockOutLat))) flags.push({ id: `${entry.id}-gps`, severity: 'review', title: 'Missing GPS', detail: `${employeeName} has ${job?.name ?? entry.eventType} time with incomplete GPS capture.`, entry });
    if (!isAdminCreated && gps.status === 'outside') flags.push({ id: `${entry.id}-geofence`, severity: 'review', title: 'Off-site punch', detail: `${employeeName} punched ${jobDisplayNameById(entry.jobCodeId, jobById, siteById)} outside the ${site?.geofenceRadiusMeters ?? 250}m geofence.`, entry });
    if (entry.isAutoClockedOut) flags.push({ id: `${entry.id}-auto`, severity: 'review', title: 'Auto clock-out', detail: `${employeeName} has an auto clock-out to review.`, entry });

    return flags;
  });
}

function flagDismissalKey(flag: ReviewFlag) {
  const entry = flag.entry;
  if (!entry) return flag.id;
  return [
    flag.id,
    entry.clockIn,
    entry.clockOut ?? 'open',
    entry.jobCodeId ?? 'no-job',
    entry.editedAt ?? 'unedited',
    entry.isAutoClockedOut ? 'auto' : 'manual',
  ].join(':');
}

function getJobSplits(entries: TimeEntry[], jobById: Map<string, JobCode>, siteById: Map<string, JobSite>, employee: Profile) {
  const splits = entries
    .filter((entry) => entry.eventType === 'work' || entry.eventType === 'break')
    .reduce<Record<string, number>>((totals, entry) => {
      const name = jobDisplayNameById(entry.jobCodeId, jobById, siteById);
      const duration = getEntryDurationHours(entry);
      const unpaidBreakHours = employee.paidBreaks ? Math.max(0, duration - employee.paidBreakMinutes / 60) : duration;
      totals[name] = (totals[name] ?? 0) + (entry.eventType === 'break' ? -unpaidBreakHours : duration);
      return totals;
    }, {});

  return Object.entries(splits)
    .map(([name, hours]) => ({ name, hours: Math.max(0, hours) }))
    .filter((split) => split.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

function projectionLabel(workdayProgress: ReturnType<typeof getWorkdayProgress>, projectionFactor: number) {
  if (workdayProgress.totalWorkdays === 0) return 'No workdays in period';
  if (workdayProgress.elapsedWorkdays <= 0) return 'Projection starts on first workday';
  if (workdayProgress.elapsedWorkdays >= workdayProgress.totalWorkdays || projectionFactor <= 1) return 'Period actual';
  return `${workdayProgress.percent}% of workdays elapsed`;
}

function formatWorkdayCount(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function Metric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-app-border bg-card-alt p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 break-words text-2xl font-bold">{value}</p>
      {sublabel && <p className="mt-1 text-xs font-semibold text-muted">{sublabel}</p>}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-md bg-card-alt p-2"><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 break-words font-bold">{value}</p></div>;
}

function Panel({ id, title, action, children }: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="min-w-0 scroll-mt-20 space-y-3 rounded-md border border-app-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function name(profile?: Profile) {
  return profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown';
}

function money(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
}

function lunchSummaryLabel(paidBreakHours: number, unpaidBreakHours: number) {
  if (paidBreakHours > 0 && unpaidBreakHours > 0) {
    return `${paidBreakHours.toFixed(1)} paid lunch hours, ${unpaidBreakHours.toFixed(1)} unpaid`;
  }
  if (paidBreakHours > 0) return `${paidBreakHours.toFixed(1)} paid lunch hours included`;
  if (unpaidBreakHours > 0) return `${unpaidBreakHours.toFixed(1)} lunch hours excluded`;
  return 'No lunch breaks recorded';
}
