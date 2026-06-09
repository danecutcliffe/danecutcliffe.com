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

    const result = computeEntryHours([firstJob, breakAtSwitch, secondJob], profilesById(), 48, new Date('2026-06-03T12:00:00.000Z'));

    expect(result.byEntryId.get(firstJob.id)?.unpaidBreakHours).toBeCloseTo(0.5, 5);
    expect(result.byEntryId.get(firstJob.id)?.paidHours).toBeCloseTo(3.5, 5);
    expect(result.byEntryId.get(secondJob.id)?.paidHours).toBeCloseTo(4.5, 5);
  });

  it('lets orphan breaks consume paid allowance before later attributed breaks', () => {
    resetEntrySequence();
    const orphanPaidBreak = breakEntry({ id: 'orphan-paid', userId: paidBreakProfile.id, clockIn: '2026-06-02T11:00:00.000Z', hours: 20 / 60 });
    const work = workEntry({ id: 'paid-work', userId: paidBreakProfile.id, clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const attributedBreak = breakEntry({ id: 'paid-break', userId: paidBreakProfile.id, clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const result = computeEntryHours([orphanPaidBreak, work, attributedBreak], profilesById([paidBreakProfile]), 48, new Date('2026-06-03T12:00:00.000Z'));

    expect(result.unattributedBreakHours).toBeCloseTo(0, 5);
    expect(result.byEntryId.get(work.id)?.paidBreakHours).toBeCloseTo(10 / 60, 5);
    expect(result.byEntryId.get(work.id)?.unpaidBreakHours).toBeCloseTo(20 / 60, 5);
    expect(result.byEntryId.get(work.id)?.paidHours).toBeCloseTo(5 / 3, 5);
  });

  it('surfaces unpaid orphan break time instead of silently absorbing it', () => {
    resetEntrySequence();
    const orphanBreak = breakEntry({ id: 'orphan-unpaid', clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const result = computeEntryHours([orphanBreak], profilesById(), 48, new Date('2026-06-03T12:00:00.000Z'));

    expect(result.unattributedBreakHours).toBeCloseTo(0.5, 5);
  });

  it('attributes weekly overtime chronologically across entries', () => {
    resetEntrySequence();
    const first = workEntry({ id: 'first-eight', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const second = workEntry({ id: 'second-four', jobCodeId: 'job-other', clockIn: '2026-06-02T12:00:00.000Z', hours: 4 });

    const result = computeEntryHours([first, second], profilesById(), 8, new Date('2026-06-03T12:00:00.000Z'));

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

    const summary = computeTimeSummary([qaWork, qaBreak], employeeProfile, 48, new Date('2026-06-03T12:00:00.000Z'));

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

    const summary = computeTimeSummary([orphanBreak], employeeProfile, 48, new Date('2026-06-03T12:00:00.000Z'));

    expect(summary.netWorkHours).toBe(0);
    expect(summary.unpaidBreakHours).toBe(0.5);
    expect(summary.unattributedBreakHours).toBe(0.5);
  });

  it('summarizes paid-break allowance consumption through orphan and attributed breaks', () => {
    resetEntrySequence();
    const orphanPaidBreak = breakEntry({ id: 'summary-orphan-paid', userId: paidBreakProfile.id, clockIn: '2026-06-02T11:00:00.000Z', hours: 20 / 60 });
    const work = workEntry({ id: 'summary-paid-work', userId: paidBreakProfile.id, clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const attributedBreak = breakEntry({ id: 'summary-paid-break', userId: paidBreakProfile.id, clockIn: '2026-06-02T13:00:00.000Z', hours: 0.5 });

    const summary = computeTimeSummary([orphanPaidBreak, work, attributedBreak], paidBreakProfile, 48, new Date('2026-06-03T12:00:00.000Z'));

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
      weeklyOvertimeThresholdHours: 48,
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
      weeklyOvertimeThresholdHours: 48,
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
      weeklyOvertimeThresholdHours: 48,
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
