import type { Profile, TimeEntry } from '../domain/types';
import { computeTimeSummary, type TimeSummary } from './timecardHours';
import { getAtlanticDateKey, getAtlanticWeekStart } from './time';

interface BuildTimesheetWeeksArgs {
  periodDays: string[];
  entries: TimeEntry[];
  profile: Profile;
  weeklyOvertimeThresholdHours: number;
  todayKey?: string;
  now?: Date;
}

export interface TimesheetWeek {
  weekStart: string;
  weekEnd: string;
  days: string[];
  entries: TimeEntry[];
  summary: TimeSummary;
  title: string;
  rangeLabel: string;
  isCurrentWeek: boolean;
  isPartialWeek: boolean;
  isOpen: boolean;
}

export function buildTimesheetWeeks({
  periodDays,
  entries,
  profile,
  weeklyOvertimeThresholdHours,
  todayKey = getAtlanticDateKey(new Date()),
  now,
}: BuildTimesheetWeeksArgs): TimesheetWeek[] {
  const entriesByDay = entries.reduce<Record<string, TimeEntry[]>>((groups, entry) => {
    const day = getAtlanticDateKey(entry.clockIn);
    groups[day] = [...(groups[day] ?? []), entry];
    return groups;
  }, {});

  const daysByWeekStart = periodDays.reduce<Array<{ weekStart: string; days: string[] }>>((weeks, day) => {
    const weekStart = getAtlanticWeekStart(`${day}T12:00:00Z`);
    const existing = weeks.find((week) => week.weekStart === weekStart);
    if (existing) {
      existing.days.push(day);
      return weeks;
    }
    return [...weeks, { weekStart, days: [day] }];
  }, []);

  const currentWeekIndex = daysByWeekStart.findIndex((week) => {
    const start = week.days[0];
    const end = week.days[week.days.length - 1];
    return todayKey >= start && todayKey <= end;
  });

  return daysByWeekStart.map((week, index) => {
    const weekEntries = week.days.flatMap((day) => entriesByDay[day] ?? []);
    const weekStart = week.days[0];
    const weekEnd = week.days[week.days.length - 1];
    const rangeLabel = formatDateKeyRange(weekStart, weekEnd);
    const label = labelWeek(index, currentWeekIndex);

    return {
      weekStart,
      weekEnd,
      days: week.days,
      entries: weekEntries,
      summary: computeTimeSummary(weekEntries, profile, weeklyOvertimeThresholdHours, now),
      title: `${label} [${rangeLabel}]`,
      rangeLabel,
      isCurrentWeek: index === currentWeekIndex,
      isPartialWeek: week.days.length < 7,
      isOpen: weekEntries.some((entry) => !entry.clockOut),
    };
  });
}

function labelWeek(index: number, currentWeekIndex: number) {
  if (index === currentWeekIndex) return 'This Week';
  if (currentWeekIndex >= 0 && index === currentWeekIndex - 1) return 'Previous Week';
  if (currentWeekIndex >= 0 && index === currentWeekIndex + 1) return 'Next Week';
  return `Week ${index + 1}`;
}

function formatDateKeyRange(startDateKey: string, endDateKey: string) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  return `${monthName(start.month)} ${ordinal(start.day)} to ${monthName(end.month)} ${ordinal(end.day)}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function monthName(month: number) {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][month - 1];
}

function ordinal(day: number) {
  if (day >= 11 && day <= 13) return `${day}th`;
  const lastDigit = day % 10;
  if (lastDigit === 1) return `${day}st`;
  if (lastDigit === 2) return `${day}nd`;
  if (lastDigit === 3) return `${day}rd`;
  return `${day}th`;
}
