import { describe, expect, it } from 'vitest';
import { buildDetailedTimecardReport, buildHoursByLocationReport, buildPayrollSummaryReport } from '../reportModels';
import { buildReportContextEntries, buildReportWarningEntries } from '../reportContext';
import { buildReportWorkbook } from '../xlsxReports';
import {
  breakEntry,
  employeeProfile,
  jobCodes,
  jobSites,
  payPeriodSettings,
  resetEntrySequence,
  workEntry,
} from '../../test/fixtures/timeMathFixtures';

const profiles = [employeeProfile];

describe('filtered report context', () => {
  it('keeps same-day hidden breaks in the calculation context for visible rows', () => {
    resetEntrySequence();
    const work = workEntry({ id: 'visible-work', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 8 });
    const hiddenBreak = breakEntry({ id: 'hidden-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.5 });
    const periodEntries = [work, hiddenBreak];
    const visibleEntries = [work];
    const contextEntries = buildReportContextEntries(periodEntries, visibleEntries, visibleEntries, '2026-06-01', '2026-06-14');
    const warningEntries = buildReportWarningEntries(periodEntries, visibleEntries, visibleEntries);

    const report = buildDetailedTimecardReport({
      entries: visibleEntries,
      contextEntries,
      warningEntries,
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(report.rows[0].paidHours).toBeCloseTo(7.5, 5);
    expect(report.rows[0].unpaidBreak).toBeCloseTo(0.5, 5);
  });

  it('keeps hidden same-week work in OT context for filtered visible rows', () => {
    resetEntrySequence();
    const hiddenPriorWork = workEntry({ id: 'hidden-prior-work', jobCodeId: 'job-qs0358', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const visibleOtWork = workEntry({ id: 'visible-ot-work', jobCodeId: 'job-other', clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const periodEntries = [hiddenPriorWork, visibleOtWork];
    const visibleEntries = [visibleOtWork];
    const settings = { ...payPeriodSettings, weeklyOvertimeThresholdHours: 8 };

    const report = buildDetailedTimecardReport({
      entries: visibleEntries,
      contextEntries: buildReportContextEntries(periodEntries, visibleEntries, visibleEntries, '2026-06-01', '2026-06-14'),
      warningEntries: buildReportWarningEntries(periodEntries, visibleEntries, visibleEntries),
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings: settings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(report.rows[0].regularHours).toBeCloseTo(0, 5);
    expect(report.rows[0].otHours).toBeCloseTo(2, 5);
  });

  it('excludes hidden open rows from calculation context while keeping visible open rows', () => {
    resetEntrySequence();
    const visibleWork = workEntry({ id: 'visible-work', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const hiddenOpenWork = workEntry({ id: 'hidden-open-work', jobCodeId: 'job-other', clockIn: '2026-06-02T15:00:00.000Z', hours: 0, clockOut: null });
    const visibleOpenWork = workEntry({ id: 'visible-open-work', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T18:00:00.000Z', hours: 0, clockOut: null });

    const contextEntries = buildReportContextEntries(
      [visibleWork, hiddenOpenWork, visibleOpenWork],
      [visibleWork, visibleOpenWork],
      [visibleWork, visibleOpenWork],
      '2026-06-01',
      '2026-06-14',
    );

    expect(contextEntries.map((entry) => entry.id)).toContain(visibleWork.id);
    expect(contextEntries.map((entry) => entry.id)).toContain(visibleOpenWork.id);
    expect(contextEntries.map((entry) => entry.id)).not.toContain(hiddenOpenWork.id);
  });

  it('expands context to closed work outside a midweek report period but inside the same Atlantic week', () => {
    resetEntrySequence();
    const hiddenMondayWork = workEntry({ id: 'hidden-monday-work', jobCodeId: 'job-qs0358', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const visibleWednesdayWork = workEntry({ id: 'visible-wednesday-work', jobCodeId: 'job-other', clockIn: '2026-06-03T12:00:00.000Z', hours: 2 });

    const contextEntries = buildReportContextEntries(
      [hiddenMondayWork, visibleWednesdayWork],
      [visibleWednesdayWork],
      [visibleWednesdayWork],
      '2026-06-03',
      '2026-06-03',
    );

    expect(contextEntries.map((entry) => entry.id)).toContain(hiddenMondayWork.id);
    expect(contextEntries.map((entry) => entry.id)).toContain(visibleWednesdayWork.id);
  });

  it('includes same-user break warnings on the visible overnight work row clock-out date', () => {
    resetEntrySequence();
    const overnightWork = workEntry({
      id: 'visible-overnight-work',
      jobCodeId: 'job-qa0358',
      clockIn: '2026-06-02T23:00:00.000Z',
      hours: 4,
    });
    const afterMidnightBreak = breakEntry({ id: 'after-midnight-break', clockIn: '2026-06-03T01:00:00.000Z', hours: 0.25 });

    const warningEntries = buildReportWarningEntries([overnightWork, afterMidnightBreak], [overnightWork], [overnightWork]);

    expect(warningEntries.map((entry) => entry.id)).toContain(afterMidnightBreak.id);
  });

  it('carries corrected detail rows into supported summary reports', () => {
    resetEntrySequence();
    const hiddenPriorWork = workEntry({ id: 'hidden-prior-work', jobCodeId: 'job-qs0358', clockIn: '2026-06-01T12:00:00.000Z', hours: 8 });
    const visibleOtWork = workEntry({ id: 'visible-ot-work', jobCodeId: 'job-other', clockIn: '2026-06-02T12:00:00.000Z', hours: 2 });
    const periodEntries = [hiddenPriorWork, visibleOtWork];
    const visibleEntries = [visibleOtWork];
    const settings = { ...payPeriodSettings, weeklyOvertimeThresholdHours: 8 };
    const contextEntries = buildReportContextEntries(periodEntries, visibleEntries, visibleEntries, '2026-06-01', '2026-06-14');
    const warningEntries = buildReportWarningEntries(periodEntries, visibleEntries, visibleEntries);

    const hoursByLocation = buildHoursByLocationReport({
      entries: visibleEntries,
      contextEntries,
      warningEntries,
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings: settings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });
    const payrollSummary = buildPayrollSummaryReport({
      entries: visibleEntries,
      contextEntries,
      warningEntries,
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings: settings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(hoursByLocation.rows.find((row) => row.rowKind === 'grandTotal')?.otHours).toBeCloseTo(2, 5);
    expect(payrollSummary.rows[0].otHours).toBeCloseTo(2, 5);
  });

  it('calculates exported estimated pay from displayed two-decimal hours', () => {
    resetEntrySequence();
    const work = workEntry({ id: 'precision-work', clockIn: '2026-06-02T12:00:00.000Z', hours: 7.484 });

    const payrollSummary = buildPayrollSummaryReport({
      entries: [work],
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(payrollSummary.rows[0].regularHours).toBe(7.48);
    expect(payrollSummary.rows[0].estPay).toBe(134.64);
  });

  it('reconciles detailed, location, payroll summary, and XLSX outputs on unpaid-break scenarios', async () => {
    resetEntrySequence();
    const qaWork = workEntry({ id: 'reconcile-qa-work', jobCodeId: 'job-qa0358', clockIn: '2026-06-02T12:00:00.000Z', hours: 8.08 });
    const qaBreak = breakEntry({ id: 'reconcile-qa-break', clockIn: '2026-06-02T16:00:00.000Z', hours: 0.6 });
    const otherWork = workEntry({ id: 'reconcile-other-work', jobCodeId: 'job-other', clockIn: '2026-06-03T12:00:00.000Z', hours: 2 });
    const periodEntries = [qaWork, qaBreak, otherWork];
    const reportParams = {
      entries: periodEntries,
      profiles,
      jobSites,
      jobCodes,
      payPeriodSettings,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-14',
      now: new Date('2026-06-04T12:00:00.000Z'),
    };

    const detail = buildDetailedTimecardReport(reportParams);
    const hoursByLocation = buildHoursByLocationReport(reportParams);
    const payrollSummary = buildPayrollSummaryReport(reportParams);
    const qaDetailRow = detail.rows.find((row) => row.jobCode === 'QA0358');
    const otherDetailRow = detail.rows.find((row) => row.jobCode === 'EX0814');
    const grandTotal = hoursByLocation.rows.find((row) => row.rowKind === 'grandTotal');
    const qaPayrollRow = payrollSummary.rows.find((row) => row.jobCode === 'QA0358');
    const otherPayrollRow = payrollSummary.rows.find((row) => row.jobCode === 'EX0814');

    expect(qaDetailRow?.paidHours).toBe(7.48);
    expect(otherDetailRow?.paidHours).toBe(2);
    expect(grandTotal?.totalHours).toBe(9.48);
    expect(grandTotal?.estPay).toBe(170.64);
    expect(qaPayrollRow?.totalHours).toBe(7.48);
    expect(qaPayrollRow?.estPay).toBe(134.64);
    expect(otherPayrollRow?.totalHours).toBe(2);
    expect(otherPayrollRow?.estPay).toBe(36);

    const workbook = await buildReportWorkbook(payrollSummary);
    const sheet = workbook.getWorksheet('Payroll Summary');
    if (!sheet) throw new Error('Payroll Summary worksheet was not generated.');
    const qaXlsxValues: unknown[] = [];
    sheet.eachRow((row) => {
      if (row.getCell(9).value === 'QA0358') {
        qaXlsxValues.push(row.getCell(4).value, row.getCell(6).value, row.getCell(7).value);
      }
    });

    expect(qaXlsxValues).toEqual([7.48, 7.48, 134.64]);
  });
});
