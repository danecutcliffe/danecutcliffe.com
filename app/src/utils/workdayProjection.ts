import { addDaysToDateKey, formatAtlanticDateTimeInput, getAtlanticDateKey } from './time';

export interface WorkdayProgress {
  elapsedWorkdays: number;
  totalWorkdays: number;
  percent: number;
  isAfterPeriodEnd: boolean;
}

export function getWorkdayProgress(start: string, lengthDays: number, now: Date): WorkdayProgress {
  const todayKey = getAtlanticDateKey(now);
  const end = addDaysToDateKey(start, lengthDays - 1);
  const days = Array.from({ length: lengthDays }, (_, index) => addDaysToDateKey(start, index));
  const workdays = days.filter(isWeekday);
  const completedWorkdays = workdays.filter((day) => day < todayKey).length;
  const currentWorkdayFraction = workdays.includes(todayKey) ? getAtlanticDayFraction(now) : 0;
  const elapsedWorkdays = todayKey > end
    ? workdays.length
    : todayKey < start
      ? 0
      : Math.min(workdays.length, completedWorkdays + currentWorkdayFraction);

  return {
    elapsedWorkdays,
    totalWorkdays: workdays.length,
    percent: workdays.length > 0 ? Math.round((elapsedWorkdays / workdays.length) * 100) : 100,
    isAfterPeriodEnd: todayKey > end,
  };
}

export function getWorkdayProjectionFactor(progress: WorkdayProgress) {
  if (progress.elapsedWorkdays <= 0 || progress.isAfterPeriodEnd) return 1;
  if (progress.totalWorkdays <= 0) return 1;
  return progress.totalWorkdays / progress.elapsedWorkdays;
}

export function formatWorkdayCount(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function isWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getAtlanticDayFraction(now: Date) {
  const [, time = '00:00'] = formatAtlanticDateTimeInput(now).split('T');
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return Math.min(1, Math.max(0, (hour * 60 + minute) / 1_440));
}
