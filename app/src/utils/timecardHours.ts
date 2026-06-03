import type { Profile, TimeEntry } from '../domain/types';
import { OVERTIME_THRESHOLD_HOURS, getAtlanticDateKey, getAtlanticWeekStart, getEntryDurationHours } from './time';

// Single source of truth for per-work-entry hour accounting. Both the detailed
// timecard report (reportModels.ts) and labour-cost reporting (labour.ts) consume
// this so they can never drift into two different break/overtime models.
//
// Break attribution: each break's unpaid time is charged to the work entry whose
// interval CONTAINS the break's start time; failing that, to a same-day preceding
// work entry for that employee. Keying on the break START means a job switch that
// happens right after a break does not steal the break onto the new job.
//
// Overtime: weekly threshold, attributed chronologically — the hours that push the
// employee-week over the threshold are the overtime hours.

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

  breakEntriesByUserDay.forEach((breakEntries) => {
    let paidBreakUsedByProfile = new Map<string, number>();

    breakEntries.forEach((breakEntry) => {
      // Apply the daily paid-break allowance in chronological order to EVERY break
      // (matching calculateTimesheetSummary's per-day paid cap), so an unattributable
      // break still consumes its share of the allowance and can't leave extra for a
      // later break to double-count.
      const profile = profileById.get(breakEntry.userId);
      const durationHours = getEntryDurationHours(breakEntry, now);
      const paidLimit = profile?.paidBreaks ? Math.max(0, profile.paidBreakMinutes / 60) : 0;
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

export function computeEntryHours(
  entries: TimeEntry[],
  profileById: Map<string, Profile>,
  weeklyOvertimeThresholdHours: number | undefined,
  now: Date,
): EntryHoursResult {
  const threshold = weeklyOvertimeThresholdHours && weeklyOvertimeThresholdHours > 0
    ? weeklyOvertimeThresholdHours
    : OVERTIME_THRESHOLD_HOURS;
  const { allocations, unattributedBreakHours } = allocateBreaks(entries, profileById, now);
  const workEntries = entries
    .filter((entry) => entry.eventType === 'work')
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  const cumulativePaidByUserWeek = new Map<string, number>();
  const byEntryId = new Map<string, EntryHours>();

  workEntries.forEach((entry) => {
    const allocation = allocations.get(entry.id) ?? { durationHours: 0, paidHours: 0, unpaidHours: 0 };
    const durationHours = getEntryDurationHours(entry, now);
    const paidHours = Math.max(0, durationHours - allocation.unpaidHours);
    const overtimeKey = `${entry.userId}|${getAtlanticWeekStart(entry.clockIn)}`;
    const currentCumulative = cumulativePaidByUserWeek.get(overtimeKey) ?? 0;
    const regularHours = Math.max(0, Math.min(paidHours, threshold - currentCumulative));
    const otHours = Math.max(0, paidHours - regularHours);
    cumulativePaidByUserWeek.set(overtimeKey, currentCumulative + paidHours);

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
