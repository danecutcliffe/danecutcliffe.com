import { describe, expect, it } from 'vitest';
import { buildPayPeriodOptions, resolveReportRange } from '../reportRange';
import { payPeriodSettings, resetEntrySequence, workEntry } from '../../test/fixtures/timeMathFixtures';

// anchorStart 2026-06-01, lengthDays 14 -> periods start 2026-06-01, 2026-06-15, 2026-06-29, ...
const CURRENT_PERIOD_START = '2026-06-29';

function entriesAcross(clockIns: string[]) {
  resetEntrySequence();
  return clockIns.map((clockIn, index) => workEntry({ id: `entry-${index}`, clockIn, hours: 4 }));
}

describe('resolveReportRange', () => {
  it('covers exactly one pay period in single mode', () => {
    const range = resolveReportRange({
      mode: 'single',
      periodStart: '2026-06-15',
      throughPeriodStart: '2026-06-15',
      settings: payPeriodSettings,
      entries: [],
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe('2026-06-15');
    expect(range.end).toBe('2026-06-28');
    expect(range.periodCount).toBe(1);
    expect(range.spansMultiplePeriods).toBe(false);
    expect(range.reportLabel).toBe('2026-06-15 to 2026-06-28');
  });

  it('spans every period between the two selections in multiple mode', () => {
    const range = resolveReportRange({
      mode: 'multiple',
      periodStart: '2026-06-01',
      throughPeriodStart: '2026-06-29',
      settings: payPeriodSettings,
      entries: [],
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe('2026-06-01');
    expect(range.end).toBe('2026-07-12');
    expect(range.periodCount).toBe(3);
    expect(range.spansMultiplePeriods).toBe(true);
    expect(range.reportLabel).toBe('2026-06-01 to 2026-07-12 (3 pay periods)');
  });

  it('normalizes an inverted multiple-period selection', () => {
    const range = resolveReportRange({
      mode: 'multiple',
      periodStart: '2026-06-29',
      throughPeriodStart: '2026-06-01',
      settings: payPeriodSettings,
      entries: [],
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe('2026-06-01');
    expect(range.end).toBe('2026-07-12');
    expect(range.periodCount).toBe(3);
  });

  it('stretches all-time from the earliest entry period through the current period', () => {
    const range = resolveReportRange({
      mode: 'allTime',
      periodStart: CURRENT_PERIOD_START,
      throughPeriodStart: CURRENT_PERIOD_START,
      settings: payPeriodSettings,
      entries: entriesAcross(['2026-06-03T12:00:00.000Z', '2026-06-17T12:00:00.000Z']),
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe('2026-06-01');
    expect(range.end).toBe('2026-07-12');
    expect(range.periodCount).toBe(3);
    expect(range.reportLabel).toBe('All time: 2026-06-01 to 2026-07-12 (3 pay periods)');
  });

  it('extends all-time past the current period when entries are dated ahead of it', () => {
    const range = resolveReportRange({
      mode: 'allTime',
      periodStart: CURRENT_PERIOD_START,
      throughPeriodStart: CURRENT_PERIOD_START,
      settings: payPeriodSettings,
      entries: entriesAcross(['2026-07-20T12:00:00.000Z']),
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe('2026-06-29');
    expect(range.end).toBe('2026-07-26');
    expect(range.periodCount).toBe(2);
  });

  it('falls back to the current period when all-time has no entries', () => {
    const range = resolveReportRange({
      mode: 'allTime',
      periodStart: CURRENT_PERIOD_START,
      throughPeriodStart: CURRENT_PERIOD_START,
      settings: payPeriodSettings,
      entries: [],
      currentPeriodStart: CURRENT_PERIOD_START,
    });

    expect(range.start).toBe(CURRENT_PERIOD_START);
    expect(range.end).toBe('2026-07-12');
    expect(range.periodCount).toBe(1);
  });
});

describe('buildPayPeriodOptions', () => {
  it('lists newest first back to the earliest period holding an entry', () => {
    const options = buildPayPeriodOptions(
      payPeriodSettings,
      entriesAcross(['2026-06-03T12:00:00.000Z']),
      CURRENT_PERIOD_START,
      [CURRENT_PERIOD_START, CURRENT_PERIOD_START],
    );

    expect(options.map((option) => option.value)).toEqual(['2026-06-29', '2026-06-15', '2026-06-01']);
    expect(options[0].label.startsWith('Current: ')).toBe(true);
  });

  it('keeps a future selection in the list so the select never renders blank', () => {
    const options = buildPayPeriodOptions(
      payPeriodSettings,
      entriesAcross(['2026-06-03T12:00:00.000Z']),
      CURRENT_PERIOD_START,
      ['2026-06-15', '2026-07-27'],
    );

    expect(options.map((option) => option.value)).toEqual([
      '2026-07-27',
      '2026-07-13',
      '2026-06-29',
      '2026-06-15',
      '2026-06-01',
    ]);
  });

  it('keeps a selection older than the recorded entries in the list', () => {
    const options = buildPayPeriodOptions(
      payPeriodSettings,
      entriesAcross(['2026-06-29T12:00:00.000Z']),
      CURRENT_PERIOD_START,
      ['2026-06-01', CURRENT_PERIOD_START],
    );

    expect(options.map((option) => option.value)).toContain('2026-06-01');
  });
});
