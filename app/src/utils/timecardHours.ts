import type { PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { OVERTIME_THRESHOLD_HOURS, addDaysToDateKey, dayDiff, getAtlanticDateKey, getAtlanticWeekStart, getEntryDurationHours } from './time';
import { calculatePayrollGrossPay, roundHours } from './payrollRounding';

// Paid lunch minimum: from PAID_LUNCH_MIN_HOURS_EFFECTIVE_DATE on, an employee only earns
// their paid lunch allowance on an Atlantic day where productive time (work time minus all
// break time that day) reaches PAID_LUNCH_MIN_PRODUCTIVE_HOURS. Earlier days keep the old
// rule so already-processed payroll does not change.
export const PAID_LUNCH_MIN_PRODUCTIVE_HOURS = 7.5;
export const PAID_LUNCH_MIN_HOURS_EFFECTIVE_DATE = '2026-09-28';

export const PEI_OVERTIME_EFFECTIVE_DATE = '2026-06-30';
export const PEI_WEEKLY_OVERTIME_THRESHOLD_HOURS = 44;

export type OvertimeSettings = Pick<PayPeriodSettings, 'anchorStart' | 'lengthDays' | 'weeklyOvertimeThresholdHours'>;

// Single source of truth for per-work-entry hour accounting. Both the detailed
// timecard report (reportModels.ts) and labour-cost reporting (labour.ts) consume
// this so they can never drift into two different break/overtime models.
//
// Break attribution: each break's unpaid time is charged to the work entry whose
// interval CONTAINS the break's start time; failing that, to a same-day preceding
// work entry for that employee. Keying on the break START means a job switch that
// happens right after a break does not steal the break onto the new job.
//
// Overtime: attributed chronologically — the work hours that push the employee
// over the threshold are the overtime hours. Only actual work time (shift time
// minus ALL break time, paid or unpaid) counts toward the threshold, so a paid
// break is always paid at the regular rate and never itself becomes overtime.
// Contractors never earn overtime.
//
// Thresholds by work date:
// - before PEI_OVERTIME_EFFECTIVE_DATE: legacy weekly threshold from pay period settings.
// - from PEI_OVERTIME_EFFECTIVE_DATE: 44 hours per week, or, for employees on a
//   two-week averaging agreement (9x9), one 88-hour pool per 14-day pay period.

export interface BreakAllocation {
  durationHours: number;
  paidHours: number;
  unpaidHours: number;
}

export interface EntryHours {
  durationHours: number; // gross shift length (to `now` if the entry is still open)
  paidBreakHours: number; // break time counted as worked
  unpaidBreakHours: number; // break time deducted from worked hours
  paidHours: number; // worked, payable hours = durationHours - unpaidBreakHours (= regular + overtime)
  regularHours: number;
  otHours: number;
  isOpen: boolean;
}

export interface EntryHoursResult {
  byEntryId: Map<string, EntryHours>;
  // Total unpaid break time that could not be attached to any work entry. This is
  // an impossible-but-representable data state (a break with no surrounding shift);
  // callers should surface it rather than let totals silently absorb it.
  unattributedBreakHours: number;
}

export interface TimeSummary {
  grossWorkHours: number;
  breakHours: number;
  paidBreakHours: number;
  unpaidBreakHours: number;
  netWorkHours: number;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
  unattributedBreakHours: number;
}

export function findAttributedWorkEntry(workEntries: TimeEntry[], breakEntry: TimeEntry) {
  const breakStart = new Date(breakEntry.clockIn).getTime();
  const breakDay = getAtlanticDateKey(breakEntry.clockIn);
  const sameUserWorkEntries = workEntries
    .filter((entry) => entry.userId === breakEntry.userId)
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  return sameUserWorkEntries.find((entry) => {
    const start = new Date(entry.clockIn).getTime();
    const end = entry.clockOut ? new Date(entry.clockOut).getTime() : Number.POSITIVE_INFINITY;
    return breakStart >= start && breakStart <= end;
  }) ?? [...sameUserWorkEntries].reverse().find((entry) => {
    if (entry.clockIn > breakEntry.clockIn) return false;
    return getAtlanticDateKey(entry.clockIn) === breakDay || (entry.clockOut ? getAtlanticDateKey(entry.clockOut) === breakDay : false);
  }) ?? null;
}

function getProductiveHoursForUserDay(workEntries: TimeEntry[], breakEntries: TimeEntry[], userId: string, dateKey: string, now: Date): number {
  const workHours = workEntries
    .filter((entry) => entry.userId === userId && getAtlanticDateKey(entry.clockIn) === dateKey)
    .reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
  const breakHours = breakEntries.reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
  return workHours - breakHours;
}

export function allocateBreaks(entries: TimeEntry[], profileById: Map<string, Profile>, now: Date): {
  allocations: Map<string, BreakAllocation>;
  unattributedBreakHours: number;
} {
  const allocations = new Map<string, BreakAllocation>();
  const workEntries = entries.filter((entry) => entry.eventType === 'work');
  let unattributedBreakHours = 0;
  const breakEntriesByUserDay = entries
    .filter((entry) => entry.eventType === 'break')
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn))
    .reduce<Map<string, TimeEntry[]>>((groups, entry) => {
      const key = `${entry.userId}|${getAtlanticDateKey(entry.clockIn)}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
      return groups;
    }, new Map());

  workEntries.forEach((entry) => {
    allocations.set(entry.id, { durationHours: 0, paidHours: 0, unpaidHours: 0 });
  });

  breakEntriesByUserDay.forEach((breakEntries, key) => {
    const [userId, dateKey] = key.split('|');
    const earnsPaidLunch = dateKey < PAID_LUNCH_MIN_HOURS_EFFECTIVE_DATE
      || getProductiveHoursForUserDay(workEntries, breakEntries, userId, dateKey, now) >= PAID_LUNCH_MIN_PRODUCTIVE_HOURS - 1e-9;
    let paidBreakUsedByProfile = new Map<string, number>();

    breakEntries.forEach((breakEntry) => {
      // Apply the daily paid-break allowance in chronological order to EVERY break,
      // so an unattributable
      // break still consumes its share of the allowance and can't leave extra for a
      // later break to double-count.
      const profile = profileById.get(breakEntry.userId);
      const durationHours = getEntryDurationHours(breakEntry, now);
      const paidLimit = profile?.paidBreaks && earnsPaidLunch ? Math.max(0, profile.paidBreakMinutes / 60) : 0;
      const paidUsed = paidBreakUsedByProfile.get(breakEntry.userId) ?? 0;
      const paidHours = Math.max(0, Math.min(durationHours, paidLimit - paidUsed));
      const unpaidHours = Math.max(0, durationHours - paidHours);
      paidBreakUsedByProfile = new Map(paidBreakUsedByProfile).set(breakEntry.userId, paidUsed + paidHours);

      const attributedWorkEntry = findAttributedWorkEntry(workEntries, breakEntry);
      if (!attributedWorkEntry) {
        // Only the UNPAID portion is the integrity concern: that is break time
        // payroll deducts but no job code absorbed. Paid break time is not deducted.
        unattributedBreakHours += unpaidHours;
        return;
      }

      const current = allocations.get(attributedWorkEntry.id) ?? { durationHours: 0, paidHours: 0, unpaidHours: 0 };
      allocations.set(attributedWorkEntry.id, {
        durationHours: current.durationHours + durationHours,
        paidHours: current.paidHours + paidHours,
        unpaidHours: current.unpaidHours + unpaidHours,
      });
    });
  });

  return { allocations, unattributedBreakHours };
}

// Which overtime pool a work entry belongs to, and that pool's threshold.
export function getOvertimeBucket(entry: TimeEntry, profile: Profile | undefined, settings: OvertimeSettings) {
  const dateKey = getAtlanticDateKey(entry.clockIn);
  const weekStart = getAtlanticWeekStart(entry.clockIn);
  if (dateKey < PEI_OVERTIME_EFFECTIVE_DATE) {
    const legacyThreshold = settings.weeklyOvertimeThresholdHours > 0 ? settings.weeklyOvertimeThresholdHours : OVERTIME_THRESHOLD_HOURS;
    return { key: `${entry.userId}|week|${weekStart}`, thresholdHours: legacyThreshold, averaging: false };
  }
  if (profile?.otAveragingTwoWeek && settings.lengthDays > 0) {
    const periodStart = addDaysToDateKey(settings.anchorStart, Math.floor(dayDiff(settings.anchorStart, dateKey) / settings.lengthDays) * settings.lengthDays);
    return {
      key: `${entry.userId}|period|${periodStart}`,
      thresholdHours: PEI_WEEKLY_OVERTIME_THRESHOLD_HOURS * (settings.lengthDays / 7),
      averaging: true,
    };
  }
  return { key: `${entry.userId}|week|${weekStart}`, thresholdHours: PEI_WEEKLY_OVERTIME_THRESHOLD_HOURS, averaging: false };
}

export function computeEntryHours(
  entries: TimeEntry[],
  profileById: Map<string, Profile>,
  overtimeSettings: OvertimeSettings,
  now: Date,
): EntryHoursResult {
  const { allocations, unattributedBreakHours } = allocateBreaks(entries, profileById, now);
  const workEntries = entries
    .filter((entry) => entry.eventType === 'work')
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  const cumulativeWorkByBucket = new Map<string, number>();
  const byEntryId = new Map<string, EntryHours>();

  workEntries.forEach((entry) => {
    const allocation = allocations.get(entry.id) ?? { durationHours: 0, paidHours: 0, unpaidHours: 0 };
    const durationHours = getEntryDurationHours(entry, now);
    const paidHours = Math.max(0, durationHours - allocation.unpaidHours);
    // Actual work time: all attributed break time (paid or unpaid) is excluded.
    const workHours = Math.max(0, durationHours - allocation.durationHours);
    const profile = profileById.get(entry.userId);
    let otHours = 0;
    if (profile?.workerType !== 'contractor') {
      const bucket = getOvertimeBucket(entry, profile, overtimeSettings);
      const currentCumulative = cumulativeWorkByBucket.get(bucket.key) ?? 0;
      otHours = Math.max(0, Math.min(workHours, currentCumulative + workHours - bucket.thresholdHours));
      cumulativeWorkByBucket.set(bucket.key, currentCumulative + workHours);
    }
    const regularHours = Math.max(0, paidHours - otHours);

    byEntryId.set(entry.id, {
      durationHours,
      paidBreakHours: allocation.paidHours,
      unpaidBreakHours: allocation.unpaidHours,
      paidHours,
      regularHours,
      otHours,
      isOpen: !entry.clockOut,
    });
  });

  return { byEntryId, unattributedBreakHours };
}

// `contextEntries` lets a caller summarise a slice (e.g. one week) while overtime
// is still computed across the whole pay period an averaging agreement spans.
export function computeTimeSummary(
  entries: TimeEntry[],
  profile: Profile,
  overtimeSettings: OvertimeSettings,
  now = new Date(),
  contextEntries: TimeEntry[] = entries,
): TimeSummary {
  const profileById = new Map([[profile.id, profile]]);
  const { byEntryId, unattributedBreakHours: contextUnattributedBreakHours } = computeEntryHours(contextEntries, profileById, overtimeSettings, now);
  const unattributedBreakHours = contextEntries === entries ? contextUnattributedBreakHours : allocateBreaks(entries, profileById, now).unattributedBreakHours;
  const workEntryHours = entries
    .filter((entry) => entry.eventType === 'work')
    .map((entry) => byEntryId.get(entry.id))
    .filter((hours): hours is EntryHours => hours !== undefined);
  const grossWorkHours = workEntryHours.reduce((total, hours) => total + hours.durationHours, 0);
  const breakHours = entries
    .filter((entry) => entry.eventType === 'break')
    .reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
  const attributedPaidBreakHours = workEntryHours.reduce((total, hours) => total + hours.paidBreakHours, 0);
  const attributedUnpaidBreakHours = workEntryHours.reduce((total, hours) => total + hours.unpaidBreakHours, 0);
  const paidBreakHours = Math.max(0, breakHours - attributedUnpaidBreakHours - unattributedBreakHours);
  const regularHours = workEntryHours.reduce((total, hours) => total + hours.regularHours, 0);
  const overtimeHours = workEntryHours.reduce((total, hours) => total + hours.otHours, 0);
  const netWorkHours = workEntryHours.reduce((total, hours) => total + hours.paidHours, 0);
  const roundedRegularHours = roundHours(regularHours);
  const roundedOvertimeHours = roundHours(overtimeHours);

  return {
    grossWorkHours: roundHours(grossWorkHours),
    breakHours: roundHours(breakHours),
    paidBreakHours: roundHours(Math.max(attributedPaidBreakHours, paidBreakHours)),
    unpaidBreakHours: roundHours(attributedUnpaidBreakHours + unattributedBreakHours),
    netWorkHours: roundHours(netWorkHours),
    regularHours: roundedRegularHours,
    overtimeHours: roundedOvertimeHours,
    grossPay: calculatePayrollGrossPay({ regularHours: roundedRegularHours, overtimeHours: roundedOvertimeHours, hourlyRate: profile.hourlyRate }),
    unattributedBreakHours: roundHours(unattributedBreakHours),
  };
}
