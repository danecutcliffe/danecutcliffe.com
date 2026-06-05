import { afterEach, describe, expect, it } from 'vitest';
import { getPayPeriodForDate } from '../../hooks/usePayPeriodSettings';
import { mockTimeClockService } from '../mockTimeClockService';

let sequence = 0;

function isoAt(dayOffset: number, hour: number) {
  return new Date(Date.UTC(2035, 0, 1 + dayOffset, hour, 0, 0)).toISOString();
}

async function createMockEmployee() {
  sequence += 1;
  if (!mockTimeClockService.createProfile) throw new Error('Mock profile creation is unavailable.');
  await mockTimeClockService.setMockRole?.('admin');
  return mockTimeClockService.createProfile({
    email: `mock-parity-${sequence}@example.com`,
    firstName: 'Mock',
    lastName: `Parity${sequence}`,
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

async function approvePeriodFor(userId: string, isoDate: string) {
  const settings = await mockTimeClockService.getPayPeriodSettings();
  const period = getPayPeriodForDate(settings, isoDate.slice(0, 10));
  return mockTimeClockService.approveTimesheet({
    userId,
    weekStart: period.start,
    weekEnd: period.end,
    approvedBy: 'profile-admin-1',
  });
}

describe('mockTimeClockService production parity', () => {
  afterEach(async () => {
    await mockTimeClockService.setMockRole?.('employee');
  });

  it('blocks employee live punch inserts that touch an approved pay period', async () => {
    sequence += 1;
    await mockTimeClockService.setMockRole?.('employee');
    const clockIn = isoAt(sequence * 20, 9);
    await approvePeriodFor('profile-employee-1', clockIn);

    await expect(mockTimeClockService.clockIn({
      userId: 'profile-employee-1',
      jobCodeId: 'job-orlebar',
      at: clockIn,
    })).rejects.toThrow('This week has been approved.');
  });

  it('blocks manual inserts that touch an approved pay period', async () => {
    const employee = await createMockEmployee();
    const clockIn = isoAt(sequence * 20, 9);
    const clockOut = isoAt(sequence * 20, 11);
    await approvePeriodFor(employee.id, clockIn);

    await expect(mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn,
      clockOut,
      notes: 'Approved-period insert smoke',
      createdBy: 'profile-admin-1',
    })).rejects.toThrow('This week has been approved.');
  });

  it('blocks moving an unlocked entry into an approved pay period', async () => {
    const employee = await createMockEmployee();
    const originalClockIn = isoAt(sequence * 20, 9);
    const originalClockOut = isoAt(sequence * 20, 11);
    const approvedClockIn = isoAt(sequence * 20 + 8, 9);
    const approvedClockOut = isoAt(sequence * 20 + 8, 11);
    const entry = await mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn: originalClockIn,
      clockOut: originalClockOut,
      notes: 'Unlocked entry',
      createdBy: 'profile-admin-1',
    });
    await approvePeriodFor(employee.id, approvedClockIn);

    await expect(mockTimeClockService.updateTimeEntry({
      entryId: entry.id,
      patch: { clockIn: approvedClockIn, clockOut: approvedClockOut },
      editedBy: 'profile-admin-1',
    })).rejects.toThrow('This week has been approved.');
  });

  it('rejects overlapping closed work entries on insert and update while allowing adjacent work', async () => {
    const employee = await createMockEmployee();
    const dayOffset = sequence * 20;
    await mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn: isoAt(dayOffset, 9),
      clockOut: isoAt(dayOffset, 11),
      notes: 'Existing closed work',
      createdBy: 'profile-admin-1',
    });
    const adjacent = await mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn: isoAt(dayOffset, 11),
      clockOut: isoAt(dayOffset, 12),
      notes: 'Adjacent closed work',
      createdBy: 'profile-admin-1',
    });

    await expect(mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn: isoAt(dayOffset, 10),
      clockOut: isoAt(dayOffset, 12),
      notes: 'Overlapping closed work',
      createdBy: 'profile-admin-1',
    })).rejects.toThrow('overlaps another closed work entry');

    await expect(mockTimeClockService.updateTimeEntry({
      entryId: adjacent.id,
      patch: { clockIn: isoAt(dayOffset, 10), clockOut: isoAt(dayOffset, 12) },
      editedBy: 'profile-admin-1',
    })).rejects.toThrow('overlaps another closed work entry');
  });

  it('keeps manual break starts inside a same-employee work entry', async () => {
    const employee = await createMockEmployee();
    const dayOffset = sequence * 20;
    await expect(mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: null,
      eventType: 'break',
      clockIn: isoAt(dayOffset, 8),
      clockOut: isoAt(dayOffset, 9),
      notes: 'Uncovered break',
      createdBy: 'profile-admin-1',
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');

    const work = await mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: 'job-orlebar',
      eventType: 'work',
      clockIn: isoAt(dayOffset, 9),
      clockOut: isoAt(dayOffset, 11),
      notes: 'Containing work',
      createdBy: 'profile-admin-1',
    });

    await expect(mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: null,
      eventType: 'break',
      clockIn: isoAt(dayOffset, 11),
      clockOut: isoAt(dayOffset, 12),
      notes: 'Boundary break',
      createdBy: 'profile-admin-1',
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');

    const breakEntry = await mockTimeClockService.createManualEntry({
      userId: employee.id,
      jobCodeId: null,
      eventType: 'break',
      clockIn: isoAt(dayOffset, 10),
      clockOut: isoAt(dayOffset, 13),
      notes: 'Covered break',
      createdBy: 'profile-admin-1',
    });

    await expect(mockTimeClockService.updateTimeEntry({
      entryId: work.id,
      patch: { clockOut: isoAt(dayOffset, 10) },
      editedBy: 'profile-admin-1',
    })).rejects.toThrow('Work entry changes cannot leave existing break entries without a containing work entry.');

    await expect(mockTimeClockService.deleteTimeEntry({
      entryId: work.id,
    })).rejects.toThrow('Work entry changes cannot leave existing break entries without a containing work entry.');

    await expect(mockTimeClockService.updateTimeEntry({
      entryId: breakEntry.id,
      patch: { notes: 'Still covered' },
      editedBy: 'profile-admin-1',
    })).resolves.toMatchObject({ notes: 'Still covered' });
  });
});
