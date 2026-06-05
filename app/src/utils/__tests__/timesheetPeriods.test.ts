import { describe, expect, it } from 'vitest';
import { getPayPeriodDays } from '../../hooks/usePayPeriodSettings';
import { employeeProfile, resetEntrySequence, workEntry } from '../../test/fixtures/timeMathFixtures';
import { buildTimesheetWeeks } from '../timesheetPeriods';

const baseSettings = {
  anchorStart: '2026-05-25',
  lengthDays: 14,
  weeklyOvertimeThresholdHours: 48,
  laborCostMultiplier: 1.25,
};

describe('buildTimesheetWeeks', () => {
  it('groups a normal 14-day pay period into two Atlantic work weeks', () => {
    const weeks = buildTimesheetWeeks({
      periodDays: getPayPeriodDays(baseSettings, '2026-05-25'),
      entries: [],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 48,
      todayKey: '2026-06-05',
    });

    expect(weeks).toHaveLength(2);
    expect(weeks[0].title).toBe('Week of May 25th - 31st');
    expect(weeks[1].title).toBe('Week of June 1st - 7th');
    expect(weeks[0].isPartialWeek).toBe(false);
    expect(weeks[1].isCurrentWeek).toBe(true);
  });

  it('uses the full month name on both sides when a week crosses months', () => {
    const weeks = buildTimesheetWeeks({
      periodDays: ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'],
      entries: [],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 48,
      todayKey: '2026-07-03',
    });

    expect(weeks).toHaveLength(1);
    expect(weeks[0].title).toBe('Week of June 29th - July 5th');
    expect(weeks[0].isCurrentWeek).toBe(true);
  });

  it('keeps teen ordinal suffixes correct in week titles', () => {
    const weeks = buildTimesheetWeeks({
      periodDays: ['2026-07-11', '2026-07-12'],
      entries: [],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 48,
      todayKey: '2026-07-12',
    });

    expect(weeks).toHaveLength(1);
    expect(weeks[0].title).toBe('Week of July 11th - 12th');
  });

  it('keeps partial Atlantic weeks when a pay period starts midweek', () => {
    const weeks = buildTimesheetWeeks({
      periodDays: ['2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01'],
      entries: [],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 48,
      todayKey: '2026-06-10',
    });

    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toEqual(['2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31']);
    expect(weeks[1].days).toEqual(['2026-06-01']);
    expect(weeks.every((week) => week.isPartialWeek)).toBe(true);
  });

  it('computes each weekly summary from the whole week, not from daily totals', () => {
    resetEntrySequence();
    const first = workEntry({ id: 'week-first', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const second = workEntry({ id: 'week-second', clockIn: '2026-06-02T12:00:00.000Z', hours: 4 });

    const weeks = buildTimesheetWeeks({
      periodDays: getPayPeriodDays(baseSettings, '2026-05-25'),
      entries: [first, second],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 8,
      todayKey: '2026-06-05',
      now: new Date('2026-06-05T12:00:00.000Z'),
    });

    expect(weeks[1].summary.regularHours).toBe(8);
    expect(weeks[1].summary.overtimeHours).toBe(4);
  });

  it('keeps an empty week visible with an empty summary', () => {
    const weeks = buildTimesheetWeeks({
      periodDays: getPayPeriodDays(baseSettings, '2026-05-25'),
      entries: [],
      profile: employeeProfile,
      weeklyOvertimeThresholdHours: 48,
      todayKey: '2026-06-05',
    });

    expect(weeks[0].entries).toHaveLength(0);
    expect(weeks[0].summary.netWorkHours).toBe(0);
  });
});
