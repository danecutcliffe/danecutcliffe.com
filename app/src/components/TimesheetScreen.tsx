import { useEffect, useMemo, useState } from 'react';
import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry, TimesheetApproval } from '../domain/types';
import { getPayPeriodDays, getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { employeeJobDisplayName, jobSiteById } from '../utils/jobs';
import { computeTimeSummary, type TimeSummary } from '../utils/timecardHours';
import { addDaysToDateKey, formatAtlanticDate, formatAtlanticTime, formatDurationCompact, getAtlanticDateKey, getEntryDurationHours, groupEntriesByAtlanticDate } from '../utils/time';
import { buildTimesheetWeeks, type TimesheetWeek } from '../utils/timesheetPeriods';

interface TimesheetScreenProps {
  profile: Profile;
  jobSites: JobSite[];
  jobCodes: JobCode[];
  entries: TimeEntry[];
  approvals: TimesheetApproval[];
  payPeriodSettings: PayPeriodSettings;
}

export function TimesheetScreen({ profile, jobSites, jobCodes, entries, approvals, payPeriodSettings }: TimesheetScreenProps) {
  const currentPeriod = useMemo(() => getPayPeriodForDate(payPeriodSettings), [payPeriodSettings]);
  const [periodStart, setPeriodStart] = useState(currentPeriod.start);
  const periodDays = getPayPeriodDays(payPeriodSettings, periodStart);
  const jobById = useMemo(() => new Map(jobCodes.map((job) => [job.id, job])), [jobCodes]);
  const siteById = useMemo(() => jobSiteById(jobSites), [jobSites]);
  const periodEntries = entries.filter((entry) => periodDays.includes(getAtlanticDateKey(entry.clockIn)));
  const periodApproval = approvals.find((approval) => approval.userId === profile.id && approval.weekStart === periodStart && approval.status === 'approved');
  const groupedEntries = groupEntriesByAtlanticDate(periodEntries);
  const summary = computeTimeSummary(periodEntries, profile, payPeriodSettings.weeklyOvertimeThresholdHours);
  const timesheetWeeks = buildTimesheetWeeks({
    periodDays,
    entries: periodEntries,
    profile,
    weeklyOvertimeThresholdHours: payPeriodSettings.weeklyOvertimeThresholdHours,
  });
  const displayWeeks = [...timesheetWeeks].reverse();

  useEffect(() => {
    setPeriodStart(currentPeriod.start);
  }, [currentPeriod.start, payPeriodSettings.lengthDays]);

  return (
    <section className="space-y-4">
      <div id="week-nav" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <button className="min-h-12 rounded-md border border-input-border px-3 font-bold" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, -payPeriodSettings.lengthDays))}>Prev</button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Pay period</p>
            <h2 className="text-lg font-bold">{formatAtlanticDate(periodStart)} - {formatAtlanticDate(periodDays[periodDays.length - 1])}</h2>
            {periodApproval && <p className="mt-1 text-xs font-bold text-success">Approved</p>}
          </div>
          <button className="min-h-12 rounded-md border border-input-border px-3 font-bold" type="button" onClick={() => setPeriodStart(addDaysToDateKey(periodStart, payPeriodSettings.lengthDays))}>Next</button>
        </div>
      </div>

      <div id="week-summary" className="scroll-mt-20 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Regular" value={`${summary.regularHours.toFixed(2)}h`} />
        <SummaryCard label="Overtime" value={`${summary.overtimeHours.toFixed(2)}h`} tone={summary.overtimeHours > 0 ? 'warn' : 'default'} />
        <SummaryCard label="Est. gross" value={`$${summary.grossPay.toFixed(2)}`} />
      </div>

      <div id="daily-breakdown" className="scroll-mt-20 rounded-md border border-app-border bg-card p-4 shadow-soft">
        <div className="space-y-5">
          {displayWeeks.map((week) => (
            <section key={week.weekStart} className="time-day-panel pb-5 last:pb-0">
              <WeekSectionHeader week={week} />
              {week.entries.length === 0 ? (
                <p className="mt-4 rounded-md bg-card-alt p-3 text-sm text-muted">No entries for this week.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {[...week.days].reverse().map((day) => {
                    const dayEntries = [...(groupedEntries[day] ?? [])].sort((a, b) => b.clockIn.localeCompare(a.clockIn));
                    if (dayEntries.length === 0) return null;
                    const daySummary = computeTimeSummary(dayEntries, profile, payPeriodSettings.weeklyOvertimeThresholdHours);
          return (
                      <section key={day} className="rounded-md border border-app-border-subtle bg-card p-3">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-bold">{formatAtlanticDate(day)}</h4>
                          <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Net work hours {daySummary.netWorkHours.toFixed(2)}h</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {dayEntries.map((entry) => {
                            const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : null;
                            const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : null;
                            return (
                              <div key={entry.id} className="rounded-md bg-card-alt p-3 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="mb-2 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">{formatDurationCompact(getEntryDurationHours(entry))}</span>
                                    <p className="font-semibold">{entry.eventType === 'break' ? 'Break' : employeeJobDisplayName(job, site)}</p>
                                    <p className="text-muted">{formatAtlanticTime(entry.clockIn)} - {entry.clockOut ? formatAtlanticTime(entry.clockOut) : 'In progress'}</p>
                                  </div>
                                  <span className="font-bold">{getEntryDurationHours(entry).toFixed(2)}h</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <DailyBreakdown summary={daySummary} isOpen={dayEntries.some((entry) => !entry.clockOut)} showPaidLunchCredit={profile.paidBreaks} />
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
        <h3 className="text-lg font-bold">Pay period total</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Work span" value={`${summary.grossWorkHours.toFixed(2)}h`} />
          <Metric label="Breaks" value={`${summary.breakHours.toFixed(2)}h`} />
          <Metric label="Net hours" value={`${summary.netWorkHours.toFixed(2)}h`} />
          <Metric label="Rate" value={`$${profile.hourlyRate.toFixed(2)}/h`} />
        </dl>
      </div>
    </section>
  );
}

function WeekSectionHeader({ week }: { week: TimesheetWeek }) {
  return (
    <div className="rounded-md border border-app-border-subtle bg-card-alt px-4 py-3">
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="mt-1 h-8 w-1.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <h3 className="text-base font-bold sm:text-lg">{week.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {week.isCurrentWeek && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">This week</span>}
              {week.isPartialWeek && <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Partial work week</span>}
              {week.isOpen && <span className="rounded-full bg-badge-neutral px-3 py-1 text-xs font-bold text-muted">Open entry</span>}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Net hours</p>
          <p className="mt-1 text-2xl font-bold text-ink">{week.summary.netWorkHours.toFixed(2)}h</p>
        </div>
      </div>
    </div>
  );
}

function DailyBreakdown({
  summary,
  isOpen,
  showPaidLunchCredit,
}: {
  summary: TimeSummary;
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

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-md border border-app-border bg-card p-4 shadow-soft">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === 'warn' ? 'text-warning' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value}</dd>
    </div>
  );
}
