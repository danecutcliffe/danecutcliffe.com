import { describe, expect, it } from 'vitest';

import type { TimeEntry } from '../../domain/types';
import { buildSplitPlan, findBreaksCrossingSplits } from '../splitEntry';
import { parseAtlanticDateTimeInput } from '../time';

const at = (value: string) => parseAtlanticDateTimeInput(value);

const isaiahDay = {
  clockIn: at('2026-07-02T08:30'),
  clockOut: at('2026-07-02T17:15'),
  firstJobCodeId: 'queen',
};

describe('buildSplitPlan', () => {
  it('splits a full day into contiguous segments (Isaiah July 2nd)', () => {
    const plan = buildSplitPlan({
      ...isaiahDay,
      dividers: [
        { time: '12:45', jobCodeId: 'cumberland' },
        { time: '15:15', jobCodeId: 'queen' },
        { time: '16:00', jobCodeId: 'cumberland' },
        { time: '16:45', jobCodeId: 'orlebar' },
      ],
    });

    expect(plan).toEqual({
      ok: true,
      segments: [
        { clockIn: isaiahDay.clockIn, clockOut: at('2026-07-02T12:45'), jobCodeId: 'queen' },
        { clockIn: at('2026-07-02T12:45'), clockOut: at('2026-07-02T15:15'), jobCodeId: 'cumberland' },
        { clockIn: at('2026-07-02T15:15'), clockOut: at('2026-07-02T16:00'), jobCodeId: 'queen' },
        { clockIn: at('2026-07-02T16:00'), clockOut: at('2026-07-02T16:45'), jobCodeId: 'cumberland' },
        { clockIn: at('2026-07-02T16:45'), clockOut: isaiahDay.clockOut, jobCodeId: 'orlebar' },
      ],
    });
  });

  it('preserves the original punch in and punch out exactly', () => {
    const plan = buildSplitPlan({ ...isaiahDay, dividers: [{ time: '12:00', jobCodeId: 'cumberland' }] });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.segments[0].clockIn).toBe(isaiahDay.clockIn);
    expect(plan.segments[plan.segments.length - 1].clockOut).toBe(isaiahDay.clockOut);
  });

  it('rolls a divider past midnight for overnight shifts', () => {
    const plan = buildSplitPlan({
      clockIn: at('2026-07-02T22:00'),
      clockOut: at('2026-07-03T06:00'),
      firstJobCodeId: 'queen',
      dividers: [{ time: '02:00', jobCodeId: 'cumberland' }],
    });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.segments[0].clockOut).toBe(at('2026-07-03T02:00'));
  });

  it('rejects a blank divider time', () => {
    const plan = buildSplitPlan({ ...isaiahDay, dividers: [{ time: '', jobCodeId: 'cumberland' }] });
    expect(plan).toEqual({ ok: false, error: 'Enter a time for every split.' });
  });

  it('rejects a missing job code on a divider or the first segment', () => {
    expect(buildSplitPlan({ ...isaiahDay, dividers: [{ time: '12:00', jobCodeId: '' }] }))
      .toEqual({ ok: false, error: 'Every segment needs a job code.' });
    expect(buildSplitPlan({ ...isaiahDay, firstJobCodeId: '', dividers: [{ time: '12:00', jobCodeId: 'cumberland' }] }))
      .toEqual({ ok: false, error: 'Every segment needs a job code.' });
  });

  it('rejects out-of-order and out-of-range divider times', () => {
    expect(buildSplitPlan({
      ...isaiahDay,
      dividers: [
        { time: '15:00', jobCodeId: 'cumberland' },
        { time: '12:00', jobCodeId: 'queen' },
      ],
    })).toEqual({ ok: false, error: 'Split times must be between punch in and punch out.' });

    expect(buildSplitPlan({ ...isaiahDay, dividers: [{ time: '17:15', jobCodeId: 'cumberland' }] }))
      .toEqual({ ok: false, error: 'Split times must be between punch in and punch out.' });

    expect(buildSplitPlan({ ...isaiahDay, dividers: [{ time: '08:30', jobCodeId: 'cumberland' }] }))
      .toEqual({ ok: false, error: 'Split times must be between punch in and punch out.' });
  });

  it('rejects an open entry', () => {
    const plan = buildSplitPlan({ clockIn: isaiahDay.clockIn, clockOut: '', firstJobCodeId: 'queen', dividers: [{ time: '12:00', jobCodeId: 'cumberland' }] });
    expect(plan).toEqual({ ok: false, error: 'Only completed entries can be split.' });
  });
});

describe('findBreaksCrossingSplits', () => {
  const makeBreak = (clockIn: string, clockOut: string): TimeEntry => ({
    id: 'break-1',
    userId: 'user-1',
    jobCodeId: null,
    eventType: 'break',
    clockIn,
    clockOut,
    isAutoClockedOut: false,
    createdAt: clockIn,
  });

  const plan = buildSplitPlan({ ...isaiahDay, dividers: [{ time: '12:45', jobCodeId: 'cumberland' }] });
  const segments = plan.ok ? plan.segments : [];

  it('flags a break that spans a split boundary', () => {
    const spanning = makeBreak(at('2026-07-02T12:30'), at('2026-07-02T13:00'));
    expect(findBreaksCrossingSplits([spanning], segments)).toEqual([spanning]);
  });

  it('ignores breaks fully inside a segment', () => {
    const contained = makeBreak(at('2026-07-02T10:00'), at('2026-07-02T10:30'));
    expect(findBreaksCrossingSplits([contained], segments)).toEqual([]);
  });
});
