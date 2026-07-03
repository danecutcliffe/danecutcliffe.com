import { describe, expect, it } from 'vitest';

import { mockTimeClockService } from '../mockTimeClockService';
import { buildSplitPlan, buildSplitSavePlan } from '../../utils/splitEntry';

let sequence = 100;

function isoAt(dayOffset: number, hour: number, minute = 0) {
  return new Date(Date.UTC(2035, 5, 1 + dayOffset, hour, minute, 0)).toISOString();
}

async function createMockEmployee() {
  sequence += 1;
  if (!mockTimeClockService.createProfile) throw new Error('Mock profile creation is unavailable.');
  await mockTimeClockService.setMockRole?.('admin');
  return mockTimeClockService.createProfile({
    email: `split-seq-${sequence}@example.com`,
    firstName: 'Split',
    lastName: `Sequence${sequence}`,
    role: 'employee',
    workerType: 'employee',
    contractorHstApplicable: false,
    hourlyRate: 25,
    paidBreaks: false,
    paidBreakMinutes: 30,
    canAccessScopes: false,
    isActive: true,
  });
}

describe('split save sequence against production-parity guards', () => {
  it('splits a day with a mid-segment break while the employee has an open shift elsewhere', async () => {
    const employee = await createMockEmployee();
    const day = sequence * 3;
    const jobCodes = await mockTimeClockService.listJobCodes();
    const [jobA, jobB, jobC] = jobCodes.filter((job) => job.isActive);

    // Closed full-day entry (12:00-21:00 UTC), a punched break at 16:00 UTC,
    // and an open shift the next day - the state that broke the first release.
    const original = await mockTimeClockService.createManualEntry({
      userId: employee.id, jobCodeId: jobA.id, eventType: 'work',
      clockIn: isoAt(day, 12), clockOut: isoAt(day, 21), notes: 'full day', createdBy: 'profile-admin-1',
    });
    const lunch = await mockTimeClockService.createManualEntry({
      userId: employee.id, jobCodeId: null, eventType: 'break',
      clockIn: isoAt(day, 16), clockOut: isoAt(day, 16, 30), notes: 'Lunch', createdBy: 'profile-admin-1',
    });
    const openShift = await mockTimeClockService.createManualEntry({
      userId: employee.id, jobCodeId: jobA.id, eventType: 'work',
      clockIn: isoAt(day + 1, 12), clockOut: null, notes: 'still on site', createdBy: 'profile-admin-1',
    });

    // Three segments; the break (16:00-16:30 UTC) falls inside the middle one.
    const plan = buildSplitPlan({
      clockIn: original.clockIn,
      clockOut: original.clockOut ?? '',
      firstJobCodeId: jobA.id,
      dividers: [
        { time: '11:00', jobCodeId: jobB.id },
        { time: '15:00', jobCodeId: jobC.id },
      ],
    });
    if (!plan.ok) throw new Error(plan.error);
    const savePlan = buildSplitSavePlan(plan.segments, [lunch]);
    if (!savePlan.ok) throw new Error(savePlan.error);
    expect(savePlan.restIndex).toBe(1);

    // Execute exactly what SplitEntryModal's onSave does.
    for (const patch of savePlan.updates) {
      await mockTimeClockService.updateTimeEntry({ entryId: original.id, patch, editedBy: 'profile-admin-1' });
    }
    for (const segment of savePlan.creates) {
      await mockTimeClockService.createManualEntry({
        userId: employee.id, jobCodeId: segment.jobCodeId, eventType: 'work',
        clockIn: segment.clockIn, clockOut: segment.clockOut, notes: original.notes ?? '', createdBy: 'profile-admin-1',
      });
    }

    const entries = await mockTimeClockService.listTimeEntries({ userId: employee.id });
    const dayWork = entries
      .filter((entry) => entry.eventType === 'work' && entry.clockIn.slice(0, 10) === original.clockIn.slice(0, 10))
      .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
    expect(dayWork).toHaveLength(3);
    expect(dayWork.map((entry) => [entry.clockIn, entry.clockOut, entry.jobCodeId])).toEqual([
      [plan.segments[0].clockIn, plan.segments[0].clockOut, jobA.id],
      [plan.segments[1].clockIn, plan.segments[1].clockOut, jobB.id],
      [plan.segments[2].clockIn, plan.segments[2].clockOut, jobC.id],
    ]);
    // The original entry survives as the break-holding middle segment.
    expect(dayWork[1].id).toBe(original.id);
    const breakAfter = entries.find((entry) => entry.id === lunch.id);
    expect(breakAfter?.clockIn).toBe(lunch.clockIn);
    const stillOpen = entries.find((entry) => entry.id === openShift.id);
    expect(stillOpen?.clockOut).toBeNull();
  });

  it('rejects creating a second open work entry (mirrors time_entries_one_open_work_idx)', async () => {
    const employee = await createMockEmployee();
    const day = sequence * 3;
    const jobCodes = await mockTimeClockService.listJobCodes();
    const job = jobCodes.find((candidate) => candidate.isActive);
    if (!job) throw new Error('No active job code in mock data.');

    await mockTimeClockService.createManualEntry({
      userId: employee.id, jobCodeId: job.id, eventType: 'work',
      clockIn: isoAt(day, 12), clockOut: null, notes: 'open', createdBy: 'profile-admin-1',
    });
    await expect(mockTimeClockService.createManualEntry({
      userId: employee.id, jobCodeId: job.id, eventType: 'work',
      clockIn: isoAt(day, 14), clockOut: null, notes: 'second open', createdBy: 'profile-admin-1',
    })).rejects.toThrow(/time_entries_one_open_work_idx/);
  });
});
