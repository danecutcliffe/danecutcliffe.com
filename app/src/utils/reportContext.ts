import type { TimeEntry } from '../domain/types';
import { addDaysToDateKey, getAtlanticDateKey, getAtlanticWeekStart } from './time';

export function buildReportContextEntries(entries: TimeEntry[], visibleEntries: TimeEntry[], visibleWorkEntries: TimeEntry[], periodStart: string, periodEnd: string) {
  const userIds = new Set(visibleWorkEntries.map((entry) => entry.userId));
  const visibleEntryIds = new Set(visibleEntries.map((entry) => entry.id));
  if (userIds.size === 0) return visibleWorkEntries;

  const contextStart = weekStartForDateKey(periodStart);
  const contextEnd = addDaysToDateKey(weekStartForDateKey(periodEnd), 6);

  return entries.filter((entry) => {
    if (!userIds.has(entry.userId)) return false;
    const dateKey = getAtlanticDateKey(entry.clockIn);
    if (dateKey < contextStart || dateKey > contextEnd) return false;

    // Closed hidden rows are useful OT context. Open hidden rows are volatile, so
    // only include an open row when it is itself visible in the selected report.
    return Boolean(entry.clockOut) || visibleEntryIds.has(entry.id);
  });
}

export function buildReportWarningEntries(periodEntries: TimeEntry[], visibleEntries: TimeEntry[], visibleWorkEntries: TimeEntry[]) {
  const visibleEntryIds = new Set(visibleEntries.map((entry) => entry.id));
  const visibleUserDays = new Set<string>();
  visibleWorkEntries.forEach((entry) => {
    visibleUserDays.add(`${entry.userId}|${getAtlanticDateKey(entry.clockIn)}`);
    if (entry.clockOut) visibleUserDays.add(`${entry.userId}|${getAtlanticDateKey(entry.clockOut)}`);
  });

  return periodEntries.filter((entry) => (
    visibleEntryIds.has(entry.id) || visibleUserDays.has(`${entry.userId}|${getAtlanticDateKey(entry.clockIn)}`)
  ));
}

function weekStartForDateKey(dateKey: string) {
  return getAtlanticWeekStart(`${dateKey}T12:00:00Z`);
}
