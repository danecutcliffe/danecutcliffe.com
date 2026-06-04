import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { getEntryGpsVerification, jobDisplayNameById, jobSiteById } from '../utils/jobs';
import { buildPayrollExportReadiness } from '../utils/reportReadiness';
import { computeTimeSummary } from '../utils/timecardHours';
import { addDaysToDateKey, dayDiff, formatAtlanticDate, formatAtlanticDateTime, formatAtlanticTime, getAtlanticDateKey, getEntryDurationHours } from '../utils/time';

interface AdminDashboardProps {
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  payPeriodSettings: PayPeriodSettings;
  onOpenTimesheets?: () => void;
}

type FlagSeverity = 'blocker' | 'review';

interface ReviewFlag {
  id: string;
  severity: FlagSeverity;
  title: string;
  detail: string;
  entry?: TimeEntry;
}

export function AdminDashboard({ profiles, jobSites, jobCodes, entries, payPeriodSettings, onOpenTimesheets }: AdminDashboardProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const [isAttentionOpen, setIsAttentionOpen] = useState(true);
  const periodEnd = addDaysToDateKey(periodStart, payPeriodSettings.lengthDays - 1);
  const todayKey = getAtlanticDateKey(new Date());
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
  const exportReadiness = useMemo(() => buildPayrollExportReadiness(periodEntries, profileById, payPeriodSettings), [payPeriodSettings, periodEntries, profileById]);
  const blockerCount = flags.filter((flag) => flag.severity === 'blocker').length;
  const reviewCount = flags.length - blockerCount;
  const readiness = flags.length === 0 ? 'ready' : blockerCount > 0 ? 'blocked' : 'review';
  const periodProgress = getPeriodProgress(periodStart, payPeriodSettings.lengthDays, todayKey);
  const projectionFactor = periodProgress.elapsedDays > 0 && periodProgress.isCurrentOrFuture ? payPeriodSettings.lengthDays / periodProgress.elapsedDays : 1;
  const projectedPayroll = periodSummary.grossPay * projectionFactor;
  const openEntries = periodEntries.filter((entry) => !entry.clockOut);

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
  }, [currentPeriod.start, payPeriodSettings.lengthDays]);

  return (
    <section className="space-y-4">
      <div id="period-readiness" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${readinessClass(readiness)}`}>{readinessLabel(readiness)}</span>
              <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">{payPeriodSettings.lengthDays}-day period</span>
              <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Employee lunch rules</span>
              <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">OT after {payPeriodSettings.weeklyOvertimeThresholdHours}h/week</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold leading-tight">Is this pay period ready for payroll review?</h2>
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

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-muted">
            <span>{periodProgress.elapsedDays} of {payPeriodSettings.lengthDays} days elapsed</span>
            <span>{periodProgress.percent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-badge-neutral">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${periodProgress.percent}%` }} />
          </div>
        </div>
        <DashboardReadinessSummary readiness={exportReadiness} />
      </div>

      <Panel id="working-now" title="Working now">
        {openEntries.length === 0 && <p className="text-sm text-muted">No open shifts or breaks in this period.</p>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {openEntries.map((entry) => (
            <div key={entry.id} className="min-w-0 rounded-md border border-app-border p-3">
              <p className="break-words font-bold">{name(profileById.get(entry.userId))}</p>
              <p className="break-words text-sm text-muted">{entry.eventType === 'break' ? 'Break' : jobDisplayNameById(entry.jobCodeId, jobById, siteById)}</p>
              <p className="mt-2 text-sm font-semibold text-muted-strong">Open for {getEntryDurationHours(entry).toFixed(1)}h</p>
            </div>
          ))}
        </div>
      </Panel>

      <div id="metrics" className="scroll-mt-20 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total accrued payroll this period" value={money(periodSummary.grossPay)} sublabel={lunchSummaryLabel(periodSummary.paidBreakHours, periodSummary.unpaidBreakHours)} />
        <Metric label="Projected total payroll this period" value={money(projectedPayroll)} sublabel={projectionFactor > 1 ? `At current pace x${projectionFactor.toFixed(1)}` : 'Period actual'} />
        <Metric label="Payable hours" value={`${periodSummary.netWorkHours.toFixed(1)}h`} />
        <Metric label="Attention items" value={flags.length.toString()} sublabel={`${blockerCount} blockers, ${reviewCount} review`} />
      </div>

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
          id="attention"
          title="Attention queue"
          action={(
            <button className="min-h-9 rounded-md border border-input-border px-3 text-sm font-bold text-muted-strong" type="button" onClick={() => setIsAttentionOpen(!isAttentionOpen)}>
              {isAttentionOpen ? 'Collapse' : 'Expand'}
            </button>
          )}
        >
          {isAttentionOpen && (
            <>
              {flags.length === 0 && <p className="text-sm text-muted">No issues found for this pay period.</p>}
              <div className="space-y-2">
                {flags.slice(0, 10).map((flag) => (
                  <div key={flag.id} className={`rounded-md border p-3 text-sm ${flag.severity === 'blocker' ? 'border-error-border bg-error-bg' : 'border-warn-border bg-warn-bg'}`}>
                    <p className={`font-bold ${flag.severity === 'blocker' ? 'text-error-text' : 'text-warning'}`}>{flag.title}</p>
                    <p className="mt-1 text-muted-strong">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {!isAttentionOpen && <p className="text-sm text-muted">{flags.length} attention item{flags.length === 1 ? '' : 's'} hidden.</p>}
        </Panel>
      </div>

    </section>
  );
}

function DashboardReadinessSummary({ readiness }: { readiness: ReturnType<typeof buildPayrollExportReadiness> }) {
  if (readiness.blockers.length === 0 && readiness.warnings.length === 0 && readiness.acceptableExclusions.length === 0) {
    return (
      <p className="mt-4 rounded-md bg-success-bg p-3 text-sm font-bold text-success">
        Payroll/report integrity looks clean for this period.
      </p>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {readiness.blockers.length > 0 && <DashboardReadinessList title="Report blockers" tone="error" messages={readiness.blockers} />}
      {readiness.warnings.length > 0 && <DashboardReadinessList title="Report warnings" tone="warning" messages={readiness.warnings} />}
      {readiness.acceptableExclusions.length > 0 && <DashboardReadinessList title="Allowed exclusions" tone="neutral" messages={readiness.acceptableExclusions} />}
    </div>
  );
}

function DashboardReadinessList({ title, tone, messages }: { title: string; tone: 'error' | 'warning' | 'neutral'; messages: string[] }) {
  const className = tone === 'error'
    ? 'border-error-border bg-error-bg text-error-text'
    : tone === 'warning'
      ? 'border-warn-border bg-warn-bg text-warning'
      : 'border-app-border bg-card-alt text-muted-strong';
  return (
    <div className={`rounded-md border p-3 ${className}`}>
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-2 space-y-1 text-sm font-semibold">
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}

function EmployeeReviewCard({ employee, entries, flags, jobById, siteById, weeklyOvertimeThresholdHours, onOpenTimesheets }: { employee: Profile; entries: TimeEntry[]; flags: ReviewFlag[]; jobById: Map<string, JobCode>; siteById: Map<string, JobSite>; weeklyOvertimeThresholdHours: number; onOpenTimesheets?: () => void }) {
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
        <button className="mt-3 min-h-11 w-full rounded-md border border-input-border px-3 font-bold text-muted-strong" type="button" onClick={onOpenTimesheets}>
          Review Timesheet
        </button>
      )}
    </div>
  );
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
    if (!entry.clockInLat || (entry.clockOut && !entry.clockOutLat)) flags.push({ id: `${entry.id}-gps`, severity: 'review', title: 'Missing GPS', detail: `${employeeName} has ${job?.name ?? entry.eventType} time with incomplete GPS capture.`, entry });
    if (gps.status === 'outside') flags.push({ id: `${entry.id}-geofence`, severity: 'review', title: 'Off-site punch', detail: `${employeeName} punched ${jobDisplayNameById(entry.jobCodeId, jobById, siteById)} outside the ${site?.geofenceRadiusMeters ?? 250}m geofence.`, entry });
    if (entry.isAutoClockedOut) flags.push({ id: `${entry.id}-auto`, severity: 'review', title: 'Auto clock-out', detail: `${employeeName} has an auto clock-out to review.`, entry });
    if (entry.editedAt || (entry.createdBy && entry.createdBy !== entry.userId)) flags.push({ id: `${entry.id}-manual`, severity: 'review', title: 'Manual or edited entry', detail: `${employeeName} has an admin-created or edited entry.`, entry });

    return flags;
  });
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

function getPeriodProgress(start: string, lengthDays: number, todayKey: string) {
  const end = addDaysToDateKey(start, lengthDays - 1);
  const rawElapsed = todayKey < start ? 0 : todayKey > end ? lengthDays : dayDiff(start, todayKey) + 1;
  const elapsedDays = Math.min(lengthDays, Math.max(0, rawElapsed));
  const percent = Math.round((elapsedDays / lengthDays) * 100);
  return {
    elapsedDays,
    percent,
    isCurrentOrFuture: todayKey <= end,
  };
}

function Metric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-app-border bg-card p-4 shadow-soft">
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

function readinessLabel(readiness: 'ready' | 'review' | 'blocked') {
  if (readiness === 'ready') return 'Ready for review';
  if (readiness === 'review') return 'Review needed';
  return 'Not ready for payroll';
}

function readinessClass(readiness: 'ready' | 'review' | 'blocked') {
  if (readiness === 'ready') return 'bg-success-bg text-success';
  if (readiness === 'review') return 'bg-warn-bg text-warning';
  return 'bg-error-bg text-error-text';
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
