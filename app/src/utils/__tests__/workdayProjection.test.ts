import { describe, expect, it } from 'vitest';
import { getWorkdayProgress, getWorkdayProjectionFactor } from '../workdayProjection';

describe('workday payroll projection progress', () => {
  it('uses weekday progress instead of elapsed calendar days', () => {
    const progress = getWorkdayProgress('2026-05-25', 14, new Date('2026-06-05T15:00:00.000Z'));

    expect(progress.totalWorkdays).toBe(10);
    expect(progress.elapsedWorkdays).toBe(9.5);
    expect(progress.percent).toBe(95);
    expect(getWorkdayProjectionFactor(progress)).toBeCloseTo(1.0526, 4);
  });

  it('does not count weekend days as additional payroll progress', () => {
    const progress = getWorkdayProgress('2026-05-25', 14, new Date('2026-05-31T15:00:00.000Z'));

    expect(progress.totalWorkdays).toBe(10);
    expect(progress.elapsedWorkdays).toBe(5);
    expect(progress.percent).toBe(50);
    expect(getWorkdayProjectionFactor(progress)).toBe(2);
  });

  it('stops projecting after the period is complete', () => {
    const progress = getWorkdayProgress('2026-05-25', 14, new Date('2026-06-08T15:00:00.000Z'));

    expect(progress.percent).toBe(100);
    expect(getWorkdayProjectionFactor(progress)).toBe(1);
  });

  it('does not project before the first workday has started', () => {
    const progress = getWorkdayProgress('2026-05-25', 14, new Date('2026-05-24T15:00:00.000Z'));

    expect(progress.elapsedWorkdays).toBe(0);
    expect(progress.percent).toBe(0);
    expect(getWorkdayProjectionFactor(progress)).toBe(1);
  });
});
