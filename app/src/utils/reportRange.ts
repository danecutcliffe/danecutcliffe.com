import type { PayPeriodSettings, TimeEntry } from '../domain/types';
import { getPayPeriodForDate } from '../hooks/usePayPeriodSettings';
import { addDaysToDateKey, dayDiff, formatAtlanticDate, getAtlanticDateKey } from './time';

export type ReportRangeMode = 'single' | 'multiple' | 'allTime';

export interface ReportPeriodOption {
  value: string;
  label: string;
}

export interface ReportRange {
  mode: ReportRangeMode;
  /** First day of the first selected pay period. */
  start: string;
  /** Last day of the last selected pay period. */
  end: string;
  /** Formatted range for on-screen headings. */
  label: string;
  /** Date-key range used in report titles, subtitles and totals. */
  reportLabel: string;
  periodCount: number;
  spansMultiplePeriods: boolean;
}

interface ResolveReportRangeParams {
  mode: ReportRangeMode;
  periodStart: string;
  throughPeriodStart: string;
  settings: PayPeriodSettings;
  entries: TimeEntry[];
  currentPeriodStart: string;
}

const MAX_PERIOD_OPTIONS = 80;

export function resolveReportRange({
  mode,
  periodStart,
  throughPeriodStart,
  settings,
  entries,
  currentPeriodStart,
}: ResolveReportRangeParams): ReportRange {
  const lengthDays = Math.max(1, settings.lengthDays);

  if (mode === 'allTime') {
    const bounds = allTimePeriodBounds(settings, entries, currentPeriodStart);
    return describeRange('allTime', bounds.firstPeriodStart, bounds.lastPeriodStart, lengthDays);
  }

  if (mode === 'single') {
    return describeRange('single', periodStart, periodStart, lengthDays);
  }

  // The two selects can be driven into an inverted order, so treat the pair as a set.
  const first = periodStart <= throughPeriodStart ? periodStart : throughPeriodStart;
  const last = periodStart <= throughPeriodStart ? throughPeriodStart : periodStart;
  return describeRange('multiple', first, last, lengthDays);
}

export function buildPayPeriodOptions(
  settings: PayPeriodSettings,
  entries: TimeEntry[],
  currentPeriodStart: string,
  selectedPeriodStarts: string[] = [],
): ReportPeriodOption[] {
  const lengthDays = Math.max(1, settings.lengthDays);
  const earliestPeriodStart = earliestEntryPeriodStart(settings, entries, currentPeriodStart);
  const latestSelected = selectedPeriodStarts.reduce(
    (latest, start) => (start > latest ? start : latest),
    currentPeriodStart,
  );
  const options: ReportPeriodOption[] = [];

  for (
    let start = latestSelected, count = 0;
    start >= earliestPeriodStart && count < MAX_PERIOD_OPTIONS;
    start = addDaysToDateKey(start, -lengthDays), count += 1
  ) {
    options.push(periodOption(start, currentPeriodStart, lengthDays));
  }

  // A selection older than the option window must still render its own label,
  // otherwise the select silently shows a blank value.
  selectedPeriodStarts.forEach((selected) => {
    if (options.some((option) => option.value === selected)) return;
    options.push(periodOption(selected, currentPeriodStart, lengthDays));
  });

  return options.sort((a, b) => b.value.localeCompare(a.value));
}

function periodOption(start: string, currentPeriodStart: string, lengthDays: number): ReportPeriodOption {
  const end = addDaysToDateKey(start, lengthDays - 1);
  const prefix = start === currentPeriodStart ? 'Current: ' : '';
  return { value: start, label: `${prefix}${formatAtlanticDate(start)} - ${formatAtlanticDate(end)}` };
}

function describeRange(mode: ReportRangeMode, firstPeriodStart: string, lastPeriodStart: string, lengthDays: number): ReportRange {
  const start = firstPeriodStart;
  const end = addDaysToDateKey(lastPeriodStart, lengthDays - 1);
  const periodCount = Math.max(1, Math.round((dayDiff(start, end) + 1) / lengthDays));
  const spansMultiplePeriods = periodCount > 1;
  const formatted = `${formatAtlanticDate(start)} - ${formatAtlanticDate(end)}`;
  const periodSuffix = ` (${periodCount} pay period${periodCount === 1 ? '' : 's'})`;

  if (mode === 'allTime') {
    return {
      mode,
      start,
      end,
      label: `All time: ${formatted}${periodSuffix}`,
      reportLabel: `All time: ${start} to ${end}${periodSuffix}`,
      periodCount,
      spansMultiplePeriods,
    };
  }

  return {
    mode,
    start,
    end,
    label: spansMultiplePeriods ? `${formatted}${periodSuffix}` : formatted,
    reportLabel: spansMultiplePeriods ? `${start} to ${end}${periodSuffix}` : `${start} to ${end}`,
    periodCount,
    spansMultiplePeriods,
  };
}

function allTimePeriodBounds(settings: PayPeriodSettings, entries: TimeEntry[], currentPeriodStart: string) {
  const dateKeys = entries.map((entry) => getAtlanticDateKey(entry.clockIn));
  if (dateKeys.length === 0) {
    return { firstPeriodStart: currentPeriodStart, lastPeriodStart: currentPeriodStart };
  }

  const earliest = dateKeys.reduce((min, key) => (key < min ? key : min), dateKeys[0]);
  const latest = dateKeys.reduce((max, key) => (key > max ? key : max), dateKeys[0]);
  const firstPeriodStart = getPayPeriodForDate(settings, earliest).start;
  const latestEntryPeriodStart = getPayPeriodForDate(settings, latest).start;

  return {
    firstPeriodStart: firstPeriodStart < currentPeriodStart ? firstPeriodStart : currentPeriodStart,
    lastPeriodStart: latestEntryPeriodStart > currentPeriodStart ? latestEntryPeriodStart : currentPeriodStart,
  };
}

function earliestEntryPeriodStart(settings: PayPeriodSettings, entries: TimeEntry[], currentPeriodStart: string) {
  const dateKeys = entries.map((entry) => getAtlanticDateKey(entry.clockIn));
  if (dateKeys.length === 0) return currentPeriodStart;
  const earliest = dateKeys.reduce((min, key) => (key < min ? key : min), dateKeys[0]);
  return getPayPeriodForDate(settings, earliest).start;
}
