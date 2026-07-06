import { describe, expect, it } from 'vitest';

import { mockTimeClockService } from '../mockTimeClockService';

const employeeId = 'profile-employee-1';

async function clockInFreshEntry(at: string) {
  await mockTimeClockService.setMockRole?.('employee');
  const jobCodes = await mockTimeClockService.listJobCodes();
  const job = jobCodes.find((candidate) => candidate.isActive && !candidate.isArchived);
  if (!job) throw new Error('No active job code in mock data.');
  return mockTimeClockService.clockIn({ userId: employeeId, jobCodeId: job.id, at, gps: null });
}

describe('switch job note requirement (mirrors employee_switch_job RPC)', () => {
  it('rejects a blank note and applies a trimmed note to the closed entry', async () => {
    const opened = await clockInFreshEntry('2036-01-05T12:00:00.000Z');
    const jobCodes = await mockTimeClockService.listJobCodes();
    const otherJob = jobCodes.find((candidate) => candidate.isActive && candidate.id !== opened.jobCodeId);
    if (!otherJob) throw new Error('Need a second active job code.');

    await expect(mockTimeClockService.switchJob({
      userId: employeeId,
      fromEntryId: opened.id,
      toJobCodeId: otherJob.id,
      at: '2036-01-05T14:00:00.000Z',
      note: '   ',
    })).rejects.toThrow('Add a shift note before switching jobs.');

    const result = await mockTimeClockService.switchJob({
      userId: employeeId,
      fromEntryId: opened.id,
      toJobCodeId: otherJob.id,
      at: '2036-01-05T14:00:00.000Z',
      note: '  Swapped to the condo after lunch  ',
    });

    expect(result.closedEntry.notes).toBe('Swapped to the condo after lunch');
    expect(result.closedEntry.clockOut).toBe('2036-01-05T14:00:00.000Z');
    expect(result.openedEntry.notes).toBe('');
    expect(result.openedEntry.jobCodeId).toBe(otherJob.id);
  });
});
