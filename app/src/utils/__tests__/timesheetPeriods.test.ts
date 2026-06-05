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
    expect(weeks[0].title).toBe('Previous Week [May 25th to May 31st]');
    expect(weeks[1].title).toBe('This Week [June 1st to June 7th]');
    expect(weeks[0].isPartialWeek).toBe(false);
    expect(weeks[1].isCurrentWeek).toBe(true);
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
