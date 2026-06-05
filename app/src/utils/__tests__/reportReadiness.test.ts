import { describe, expect, it } from 'vitest';
import { buildPayrollExportReadiness } from '../reportReadiness';
import {
  breakEntry,
  employeeProfile,
  payPeriodSettings,
  resetEntrySequence,
  workEntry,
} from '../../test/fixtures/timeMathFixtures';

const profileById = new Map([[employeeProfile.id, employeeProfile]]);

describe('payroll export readiness', () => {
  it('classifies open entries as allowed exclusions instead of blockers', () => {
    resetEntrySequence();
    const openWork = workEntry({
      id: 'open-work',
      clockIn: '2026-06-02T12:00:00.000Z',
      hours: 0,
      clockOut: null,
    });

    const readiness = buildPayrollExportReadiness(
      [openWork],
      profileById,
      payPeriodSettings,
      new Date('2026-06-02T16:00:00.000Z'),
    );

    expect(readiness.blockers).toEqual([]);
    expect(readiness.acceptableExclusions).toContain('1 open work entry is excluded from payroll summary/location exports by design');
  });

  it('keeps missing payroll-critical data as blockers', () => {
    resetEntrySequence();
    const missingJob = {
      ...workEntry({ id: 'missing-job', clockIn: '2026-06-02T12:00:00.000Z', hours: 4 }),
      jobCodeId: null,
    };
    const noRateProfile = { ...employeeProfile, hourlyRate: 0 };

    const readiness = buildPayrollExportReadiness(
      [missingJob],
      new Map([[noRateProfile.id, noRateProfile]]),
      payPeriodSettings,
    );

    expect(readiness.blockers).toContain('1 work entry is missing a job code');
    expect(readiness.blockers).toContain('Missing pay rate: Emmanuel Ero');
  });

  it('surfaces orphan unpaid breaks as warnings', () => {
    resetEntrySequence();
    const orphanBreak = breakEntry({ id: 'orphan-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.6 });

    const readiness = buildPayrollExportReadiness(
      [orphanBreak],
      profileById,
      payPeriodSettings,
      new Date('2026-06-02T18:00:00.000Z'),
    );

    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toContain('0.60h of unpaid break time could not be matched to a work entry');
  });

  it('does not treat admin-created or edited entries as report warnings', () => {
    resetEntrySequence();
    const adminEdited = {
      ...workEntry({ id: 'admin-edited', clockIn: '2026-06-02T12:00:00.000Z', hours: 4 }),
      createdBy: 'admin-1',
      editedAt: '2026-06-02T16:30:00.000Z',
      editedBy: 'admin-1',
    };

    const readiness = buildPayrollExportReadiness(
      [adminEdited],
      profileById,
      payPeriodSettings,
    );

    expect(readiness.warnings).toEqual([]);
  });
});
