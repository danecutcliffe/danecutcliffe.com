import type { TimeEntry } from '../domain/types';
import { calculatePayrollGrossPay, roundHours } from './payrollRounding';

export const ATLANTIC_TIME_ZONE = 'America/Halifax';
export const OVERTIME_THRESHOLD_HOURS = 48;

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ATLANTIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeInputFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ATLANTIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getAtlanticDateKey(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const parts = datePartsFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Unable to format Atlantic date.');
  }
  return `${year}-${month}-${day}`;
}

export function formatAtlanticDateTimeInput(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const parts = dateTimeInputFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  if (!year || !month || !day || !hour || !minute) {
    throw new Error('Unable to format Atlantic date and time.');
  }
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function parseAtlanticDateTimeInput(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Enter a valid date and time.');
  const [, year, month, day, hour, minute] = match.map(Number);
  const target = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const localMillis = Date.UTC(year, month - 1, day, hour, minute);

  for (const offsetHours of [3, 4, 2, 5]) {
    const candidate = new Date(localMillis + offsetHours * 3_600_000);
    if (formatAtlanticDateTimeInput(candidate) === target) return candidate.toISOString();
  }

  return new Date(localMillis + 4 * 3_600_000).toISOString();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return utcDate.toISOString().slice(0, 10);
}

export function dayDiff(startDateKey: string, endDateKey: string): number {
  const [startYear, startMonth, startDay] = startDateKey.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDateKey.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((end - start) / 86_400_000);
}

export function getAtlanticWeekStart(input: string | Date): string {
  const dateKey = getAtlanticDateKey(input);
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDaysToDateKey(dateKey, -daysSinceMonday);
}

export function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(weekStart, index));
}

export function getCurrentAtlanticWeekStart(): string {
  return getAtlanticWeekStart(new Date());
}

export function formatAtlanticDate(input: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATLANTIC_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(typeof input === 'string' ? new Date(`${input}T12:00:00Z`) : input);
}

export function formatAtlanticDateTime(input: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATLANTIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof input === 'string' ? new Date(input) : input);
}

export function formatAtlanticTime(input: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATLANTIC_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof input === 'string' ? new Date(input) : input);
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
}

export function getEntryDurationHours(entry: TimeEntry, now = new Date()): number {
  const start = new Date(entry.clockIn).getTime();
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : now.getTime();
  return Math.max(0, end - start) / 3_600_000;
}

export function formatDurationCompact(hours: number): string {
  const totalMinutes = Math.max(0, Math.floor(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

export interface TimesheetSummaryOptions {
  paidBreaks?: boolean;
  paidBreakMinutes?: number;
  weeklyOvertimeThresholdHours?: number;
}

// Aggregate preview helper for dashboard and timesheet summary cards. It does not
// attribute breaks to job-coded work rows, so payroll/report/export row math should
// use buildDetailedTimecardReport()/computeEntryHours() instead.
export function calculateTimesheetSummary(entries: TimeEntry[], hourlyRate: number, now = new Date(), options: TimesheetSummaryOptions = {}) {
  const workEntries = entries.filter((entry) => entry.eventType === 'work');
  const breakEntries = entries.filter((entry) => entry.eventType === 'break');
  const grossWorkHours = workEntries.reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
  const breakHours = breakEntries.reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
  const paidBreakLimitHours = Math.max(0, (options.paidBreakMinutes ?? 30) / 60);
  const breakHoursByDay = breakEntries.reduce<Record<string, number>>((totals, entry) => {
    const day = getAtlanticDateKey(entry.clockIn);
    totals[day] = (totals[day] ?? 0) + getEntryDurationHours(entry, now);
    return totals;
  }, {});
  const paidBreakHours = options.paidBreaks
    ? Object.values(breakHoursByDay).reduce((total, dailyBreakHours) => total + Math.min(dailyBreakHours, paidBreakLimitHours), 0)
    : 0;
  const unpaidBreakHours = Math.max(0, breakHours - paidBreakHours);
  const netWorkHours = Math.max(0, grossWorkHours - unpaidBreakHours);
  const weeklyOvertimeThresholdHours = options.weeklyOvertimeThresholdHours && options.weeklyOvertimeThresholdHours > 0
    ? options.weeklyOvertimeThresholdHours
    : OVERTIME_THRESHOLD_HOURS;
  const grossWorkHoursByWeek = workEntries.reduce<Record<string, number>>((totals, entry) => {
    const weekStart = getAtlanticWeekStart(entry.clockIn);
    totals[weekStart] = (totals[weekStart] ?? 0) + getEntryDurationHours(entry, now);
    return totals;
  }, {});
  const unpaidBreakHoursByWeek = Object.entries(breakHoursByDay).reduce<Record<string, number>>((totals, [day, dailyBreakHours]) => {
    const weekStart = getAtlanticWeekStart(`${day}T12:00:00Z`);
    const paidDailyBreakHours = options.paidBreaks ? Math.min(dailyBreakHours, paidBreakLimitHours) : 0;
    totals[weekStart] = (totals[weekStart] ?? 0) + Math.max(0, dailyBreakHours - paidDailyBreakHours);
    return totals;
  }, {});
  const weekStarts = [...new Set([...Object.keys(grossWorkHoursByWeek), ...Object.keys(unpaidBreakHoursByWeek)])];
  const { regularHours, overtimeHours } = weekStarts.reduce(
    (totals, weekStart) => {
      const weeklyNetHours = Math.max(0, (grossWorkHoursByWeek[weekStart] ?? 0) - (unpaidBreakHoursByWeek[weekStart] ?? 0));
      return {
        regularHours: totals.regularHours + Math.min(weeklyNetHours, weeklyOvertimeThresholdHours),
        overtimeHours: totals.overtimeHours + Math.max(0, weeklyNetHours - weeklyOvertimeThresholdHours),
      };
    },
    { regularHours: 0, overtimeHours: 0 },
  );
  const roundedRegularHours = roundHours(regularHours);
  const roundedOvertimeHours = roundHours(overtimeHours);
  const grossPay = calculatePayrollGrossPay({ regularHours: roundedRegularHours, overtimeHours: roundedOvertimeHours, hourlyRate });

  return {
    grossWorkHours: roundHours(grossWorkHours),
    breakHours: roundHours(breakHours),
    paidBreakHours: roundHours(paidBreakHours),
    unpaidBreakHours: roundHours(unpaidBreakHours),
    netWorkHours: roundHours(netWorkHours),
    regularHours: roundedRegularHours,
    overtimeHours: roundedOvertimeHours,
    grossPay,
  };
}

export function groupEntriesByAtlanticDate(entries: TimeEntry[]) {
  return entries.reduce<Record<string, TimeEntry[]>>((groups, entry) => {
    const key = getAtlanticDateKey(entry.clockIn);
    groups[key] = [...(groups[key] ?? []), entry];
    return groups;
  }, {});
}

// DST fixture for later tests: entries around 2026-03-08 and 2026-11-01
// must be assigned to weeks by America/Halifax calendar date, never by fixed UTC offsets.
