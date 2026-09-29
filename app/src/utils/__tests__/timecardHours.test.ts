import { describe, expect, it } from 'vitest';
import { buildLabourCostBreakdown, buildLabourCostBreakdownAcrossPayPeriods } from '../labour';
import { computeEntryHours, computeTimeSummary } from '../timecardHours';
import {
  breakEntry,
  employeeProfile,
  jobCodes,
  jobSites,
  payPeriodSettings,
  paidBreakProfile,
  resetEntrySequence,
  overtimeSettings,
  workEntry,
} from '../../test/fixtures/timeMathFixtures';

function profilesById(profiles = [employeeProfile]) {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

describe('computeEntryHours', () => {
  it('charges a break at a job switch to the preceding same-day work entry', () => {
    resetEntrySequence();
    const firstJob = workEntry({ id: 'work-a', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T11:00:00.000Z', hours: 4 });
    const breakAtSwitch = breakEntry({ id: 'break-at-switch', clockIn: '2026-06-02T15:00:00.000Z', hours: 0.5 });
    const secondJob = workEntry({ id: 'work-b', jobCodeId: 'job-other', clockIn: '2026-06-02T15:30:00.000Z', hours: 4.5 });

    const result = computeEntryHours([firstJob, breakAtSwitch, secondJob], profilesById(), overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(result.byEntryId.get(firstJob.id)?.unpaidBreakHours).toBeCloseTo(0.5, 5);
    expect(result.byEntryId.get(firstJob.id)?.paidHours).toBeCloseTo(3.5, 5);
    expect(result.byEntryId.get(secondJob.id)?.paidHours).toBeCloseTo(4.5, 5);
  });

  it('lets orphan breaks consume paid allowance before later attributed breaks', () => {
    resetEntrySequence();
    const orphanPaidBreak = breakEntry({ id: 'orphan-paid', userId: paidBreakProfile.id, clockIn: '2026-06-02T11:00:00.000Z', hours: 20 / 60 });
    const work = workEntry({ id: 'paid-work', userId: paidBreakProfile.id, clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const attributedBreak = breakEntry({ id: 'paid-break', userId: paidBreakProfile.id, clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const result = computeEntryHours([orphanPaidBreak, work, attributedBreak], profilesById([paidBreakProfile]), overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(result.unattributedBreakHours).toBeCloseTo(0, 5);
    expect(result.byEntryId.get(work.id)?.paidBreakHours).toBeCloseTo(10 / 60, 5);
    expect(result.byEntryId.get(work.id)?.unpaidBreakHours).toBeCloseTo(20 / 60, 5);
    expect(result.byEntryId.get(work.id)?.paidHours).toBeCloseTo(5 / 3, 5);
  });

  it('surfaces unpaid orphan break time instead of silently absorbing it', () => {
    resetEntrySequence();
    const orphanBreak = breakEntry({ id: 'orphan-unpaid', clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const result = computeEntryHours([orphanBreak], profilesById(), overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(result.unattributedBreakHours).toBeCloseTo(0.5, 5);
  });

  it('attributes weekly overtime chronologically across entries', () => {
    resetEntrySequence();
    const first = workEntry({ id: 'first-eight', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const second = workEntry({ id: 'second-four', jobCodeId: 'job-other', clockIn: '2026-06-02T12:00:00.000Z', hours: 4 });

    const result = computeEntryHours([first, second], profilesById(), overtimeSettings(8), new Date('2026-06-03T12:00:00.000Z'));

    expect(result.byEntryId.get(first.id)?.regularHours).toBeCloseTo(8, 5);
    expect(result.byEntryId.get(first.id)?.otHours).toBeCloseTo(0, 5);
    expect(result.byEntryId.get(second.id)?.regularHours).toBeCloseTo(0, 5);
    expect(result.byEntryId.get(second.id)?.otHours).toBeCloseTo(4, 5);
  });
});

describe('computeTimeSummary', () => {
  it('summarizes payroll-facing UI totals from canonical entry hours', () => {
    resetEntrySequence();
    const qaWork = workEntry({ id: 'summary-qa-work', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 8.08 });
    const qaBreak = breakEntry({ id: 'summary-qa-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.6 });

    const summary = computeTimeSummary([qaWork, qaBreak], employeeProfile, overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(summary.grossWorkHours).toBe(8.08);
    expect(summary.breakHours).toBe(0.6);
    expect(summary.unpaidBreakHours).toBe(0.6);
    expect(summary.netWorkHours).toBe(7.48);
    expect(summary.regularHours).toBe(7.48);
    expect(summary.grossPay).toBe(134.64);
  });

  it('surfaces orphan unpaid break time without hiding it in net work hours', () => {
    resetEntrySequence();
    const orphanBreak = breakEntry({ id: 'summary-orphan-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.5 });

    const summary = computeTimeSummary([orphanBreak], employeeProfile, overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(summary.netWorkHours).toBe(0);
    expect(summary.unpaidBreakHours).toBe(0.5);
    expect(summary.unattributedBreakHours).toBe(0.5);
  });

  it('summarizes paid-break allowance consumption through orphan and attributed breaks', () => {
    resetEntrySequence();
    const orphanPaidBreak = breakEntry({ id: 'summary-orphan-paid', userId: paidBreakProfile.id, clockIn: '2026-06-02T11:00:00.000Z', hours: 20 / 60 });
    const work = workEntry({ id: 'summary-paid-work', userId: paidBreakProfile.id, clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const attributedBreak = breakEntry({ id: 'summary-paid-break', userId: paidBreakProfile.id, clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const summary = computeTimeSummary([orphanPaidBreak, work, attributedBreak], paidBreakProfile, overtimeSettings(48), new Date('2026-06-03T12:00:00.000Z'));

    expect(summary.breakHours).toBe(0.83);
    expect(summary.paidBreakHours).toBe(0.5);
    expect(summary.unpaidBreakHours).toBe(0.33);
    expect(summary.netWorkHours).toBe(1.67);
  });
});

describe('labour cost regression fixtures', () => {
  it('costs Emmanuel QA0358 from QA0358 net hours, not a gross-hour share of all jobs', () => {
    resetEntrySequence();
    const qaWork = workEntry({ id: 'emmanuel-qa', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 8.08 });
    const qaBreak = breakEntry({ id: 'emmanuel-qa-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.6 });
    const otherWorkA = workEntry({ id: 'emmanuel-other-a', jobCodeId: 'job-qs0358', clockIn: '2026-05-28T12:00:00.000Z', hours: 8 });
    const otherBreakA = breakEntry({ id: 'emmanuel-other-break-a', clockIn: '2026-05-28T16:00:00.000Z', hours: 0.5 });
    const otherWorkB = workEntry({ id: 'emmanuel-other-b', jobCodeId: 'job-other', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const otherBreakB = breakEntry({ id: 'emmanuel-other-break-b', clockIn: '2026-06-01T16:00:00.000Z', hours: 0.5 });

    const breakdown = buildLabourCostBreakdown({
      entries: [otherWorkA, otherBreakA, otherWorkB, otherBreakB, qaWork, qaBreak],
      profiles: [employeeProfile],
      jobSites,
      jobCodes,
      grossUpSchedule: [{ effectiveDate: '2026-01-01', multiplier: 1.25 }],
      overtimeSettings: overtimeSettings(48),
      now: new Date('2026-06-03T12:00:00.000Z'),
    });
    const qaJob = breakdown.properties.flatMap((property) => property.jobs).find((job) => job.jobCodeLabel.includes('QA0358'));

    expect(qaJob?.payableHours).toBeCloseTo(7.48, 5);
    expect(qaJob?.grossPay).toBeCloseTo(134.64, 2);
    expect(qaJob?.loadedCost).toBeCloseTo(168.30, 2);
  });

  it('costs labour from displayed two-decimal payable hours, not hidden precision', () => {
    resetEntrySequence();
    const firstWork = workEntry({ id: 'precision-labour-a', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 7.484 });
    const secondWork = workEntry({ id: 'precision-labour-b', jobCodeId: 'job-qa0358', clockIn: '2026-06-03T12:00:00.000Z', hours: 0.335 });

    const breakdown = buildLabourCostBreakdown({
      entries: [firstWork, secondWork],
      profiles: [employeeProfile],
      jobSites,
      jobCodes,
      grossUpSchedule: [{ effectiveDate: '2026-01-01', multiplier: 1.25 }],
      overtimeSettings: overtimeSettings(48),
      now: new Date('2026-06-03T12:00:00.000Z'),
    });
    const qaJob = breakdown.properties.flatMap((property) => property.jobs).find((job) => job.jobCodeLabel.includes('QA0358'));

    expect(qaJob?.payableHours).toBe(7.82);
    expect(qaJob?.grossPay).toBe(140.76);
    expect(qaJob?.loadedCost).toBe(175.95);
  });

  it('sorts employee job breakdowns by displayed loaded cost, not gross pay', () => {
    resetEntrySequence();
    const loadedEmployee = {
      ...employeeProfile,
      id: 'loaded-employee',
      email: 'loaded-employee@example.com',
      firstName: 'Loaded',
      lastName: 'Employee',
      workerType: 'employee' as const,
      contractorHstApplicable: false,
      hourlyRate: 20,
    };
    const lowerLoadedContractor = {
      ...employeeProfile,
      id: 'lower-loaded-contractor',
      email: 'lower-loaded-contractor@example.com',
      firstName: 'Lower Loaded',
      lastName: 'Contractor',
      workerType: 'contractor' as const,
      contractorHstApplicable: false,
      hourlyRate: 30,
    };
    const employeeWork = workEntry({ id: 'loaded-employee-work', userId: loadedEmployee.id, jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 10 });
    const contractorWork = workEntry({ id: 'lower-loaded-contractor-work', userId: lowerLoadedContractor.id, jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 8 });

    const breakdown = buildLabourCostBreakdown({
      entries: [employeeWork, contractorWork],
      profiles: [loadedEmployee, lowerLoadedContractor],
      jobSites,
      jobCodes,
      grossUpSchedule: [{ effectiveDate: '2026-01-01', multiplier: 1.25 }],
      overtimeSettings: overtimeSettings(48),
      now: new Date('2026-06-03T12:00:00.000Z'),
    });
    const qaJob = breakdown.properties.flatMap((property) => property.jobs).find((job) => job.jobCodeLabel.includes('QA0358'));
    const mergedBreakdown = buildLabourCostBreakdownAcrossPayPeriods({
      entries: [employeeWork, contractorWork],
      profiles: [loadedEmployee, lowerLoadedContractor],
      jobSites,
      jobCodes,
      grossUpSchedule: [{ effectiveDate: '2026-01-01', multiplier: 1.25 }],
      payPeriodSettings,
      now: new Date('2026-06-03T12:00:00.000Z'),
    });
    const mergedQaJob = mergedBreakdown.properties.flatMap((property) => property.jobs).find((job) => job.jobCodeLabel.includes('QA0358'));

    expect(qaJob?.employees.map((employee) => employee.employeeName)).toEqual(['Loaded Employee', 'Lower Loaded Contractor']);
    expect(qaJob?.employees.map((employee) => employee.grossPay)).toEqual([200, 240]);
    expect(qaJob?.employees.map((employee) => employee.loadedCost)).toEqual([250, 240]);
    expect(mergedQaJob?.employees.map((employee) => employee.employeeName)).toEqual(['Loaded Employee', 'Lower Loaded Contractor']);
  });
});

describe('paid lunch minimum hours', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');
  const day = (dateKey: string, workHours: number, breakStartUtc: string) => {
    resetEntrySequence();
    return [
      workEntry({ id: `work-${dateKey}`, userId: paidBreakProfile.id, clockIn: `${dateKey}T11:00:00.000Z`, hours: workHours }),
      breakEntry({ id: `break-${dateKey}`, userId: paidBreakProfile.id, clockIn: `${dateKey}T${breakStartUtc}:00.000Z`, hours: 0.5 }),
    ];
  };

  it('pays lunch when productive time reaches exactly 7.5 hours', () => {
    const summary = computeTimeSummary(day('2026-09-29', 8, '15:00'), paidBreakProfile, overtimeSettings(), now);
    expect(summary.paidBreakHours).toBeCloseTo(0.5, 2);
    expect(summary.unpaidBreakHours).toBeCloseTo(0, 2);
    expect(summary.netWorkHours).toBeCloseTo(8, 2);
  });

  it('does not pay lunch when productive time is under 7.5 hours', () => {
    const summary = computeTimeSummary(day('2026-09-29', 7.5, '15:00'), paidBreakProfile, overtimeSettings(), now);
    expect(summary.paidBreakHours).toBeCloseTo(0, 2);
    expect(summary.unpaidBreakHours).toBeCloseTo(0.5, 2);
    expect(summary.netWorkHours).toBeCloseTo(7, 2);
  });

  it('applies from the effective date itself', () => {
    const summary = computeTimeSummary(day('2026-09-28', 6, '14:00'), paidBreakProfile, overtimeSettings(), now);
    expect(summary.unpaidBreakHours).toBeCloseTo(0.5, 2);
    expect(summary.netWorkHours).toBeCloseTo(5.5, 2);
  });

  it('leaves days before the effective date on the old rule', () => {
    const summary = computeTimeSummary(day('2026-09-25', 7.5, '15:00'), paidBreakProfile, overtimeSettings(), now);
    expect(summary.paidBreakHours).toBeCloseTo(0.5, 2);
    expect(summary.netWorkHours).toBeCloseTo(7.5, 2);
  });
});

describe('PEI overtime (from 2026-06-30)', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');
  const averagingProfile = { ...paidBreakProfile, otAveragingTwoWeek: true };
  const contractorProfile = { ...paidBreakProfile, workerType: 'contractor' as const };

  // One shift per day, Mon-Fri from 08:00 Atlantic, each with a 30-minute paid lunch
  // at noon. `workHours` is actual work time per day (lunch excluded).
  const week = (mondayKey: string, workHoursPerDay: number[], userId = paidBreakProfile.id) => workHoursPerDay.flatMap((workHours, index) => {
    const dateKey = new Date(Date.parse(`${mondayKey}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    return [
      workEntry({ id: `work-${userId}-${dateKey}`, userId, clockIn: `${dateKey}T11:00:00.000Z`, hours: workHours + 0.5 }),
      breakEntry({ id: `break-${userId}-${dateKey}`, userId, clockIn: `${dateKey}T15:00:00.000Z`, hours: 0.5 }),
    ];
  });

  it('standard employee: paid lunches do not count toward the 44-hour week', () => {
    resetEntrySequence();
    const summary = computeTimeSummary(week('2026-07-13', [8.6, 8.6, 8.6, 8.6, 8.6]), paidBreakProfile, overtimeSettings(), now);
    expect(summary.paidBreakHours).toBeCloseTo(2.5, 2);
    expect(summary.netWorkHours).toBeCloseTo(45.5, 2);
    expect(summary.overtimeHours).toBeCloseTo(0, 2);
  });

  it('standard employee: 46 work hours + 2.5 paid lunch hours is 2 OT, not 4.5', () => {
    resetEntrySequence();
    const entries = week('2026-07-13', [9.2, 9.2, 9.2, 9.2, 9.2]);
    const summary = computeTimeSummary(entries, paidBreakProfile, overtimeSettings(), now);
    expect(summary.netWorkHours).toBeCloseTo(48.5, 2);
    expect(summary.overtimeHours).toBeCloseTo(2, 2);
    expect(summary.regularHours).toBeCloseTo(46.5, 2);
  });

  it('attributes OT only to the work entry that crosses the threshold, never to the lunch', () => {
    resetEntrySequence();
    const entries = week('2026-07-13', [9.2, 9.2, 9.2, 9.2, 9.2]);
    const { byEntryId } = computeEntryHours(entries, profilesById([paidBreakProfile]), overtimeSettings(), now);
    const friday = byEntryId.get(`work-${paidBreakProfile.id}-2026-07-17`);
    const thursday = byEntryId.get(`work-${paidBreakProfile.id}-2026-07-16`);
    expect(thursday?.otHours).toBeCloseTo(0, 5);
    expect(friday?.otHours).toBeCloseTo(2, 5);
    expect(friday?.paidBreakHours).toBeCloseTo(0.5, 5);
    expect(friday?.regularHours).toBeCloseTo(7.7, 5);
  });

  it('two-week averaging: 40 + 47 work hours is 0 OT', () => {
    resetEntrySequence();
    const entries = [...week('2026-07-13', [8, 8, 8, 8, 8]), ...week('2026-07-20', [9.4, 9.4, 9.4, 9.4, 9.4])];
    expect(computeTimeSummary(entries, averagingProfile, overtimeSettings(), now).overtimeHours).toBeCloseTo(0, 2);
    expect(computeTimeSummary(entries, paidBreakProfile, overtimeSettings(), now).overtimeHours).toBeCloseTo(3, 2);
  });

  it('two-week averaging: 50 + 40 work hours is 2 OT', () => {
    resetEntrySequence();
    const entries = [...week('2026-07-13', [10, 10, 10, 10, 10]), ...week('2026-07-20', [8, 8, 8, 8, 8])];
    expect(computeTimeSummary(entries, averagingProfile, overtimeSettings(), now).overtimeHours).toBeCloseTo(2, 2);
  });

  it('two-week averaging: a single week summary still uses the whole pay period', () => {
    resetEntrySequence();
    const firstWeek = week('2026-07-13', [10, 10, 10, 10, 10]);
    const secondWeek = week('2026-07-20', [8, 8, 8, 8, 8]);
    const summary = computeTimeSummary(secondWeek, averagingProfile, overtimeSettings(), now, [...firstWeek, ...secondWeek]);
    expect(summary.overtimeHours).toBeCloseTo(2, 2);
  });

  it('contractors never earn overtime', () => {
    resetEntrySequence();
    const summary = computeTimeSummary(week('2026-07-13', [10, 10, 10, 10, 10]), contractorProfile, overtimeSettings(), now);
    expect(summary.overtimeHours).toBe(0);
  });

  it('keeps the legacy weekly threshold before 2026-06-30', () => {
    resetEntrySequence();
    const summary = computeTimeSummary(week('2026-06-15', [9.2, 9.2, 9.2, 9.2, 9.2]), paidBreakProfile, overtimeSettings(48), now);
    expect(summary.overtimeHours).toBeCloseTo(0, 2);
  });
});
