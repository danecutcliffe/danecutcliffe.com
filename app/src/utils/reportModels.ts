import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { getAtlanticDateKey, getAtlanticWeekStart, getEntryDurationHours } from './time';
import { jobDisplayNameById, jobPropertyName, jobSiteById } from './jobs';

export type ReportCellValue = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  format?: 'date' | 'time' | 'hours' | 'currency' | 'text';
  previewClassName?: string;
}

export interface ReportModel {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  summary: Array<{ label: string; value: string }>;
  exceptions: Array<{ severity: 'blocker' | 'review'; message: string }>;
  sheets?: Array<{
    title: string;
    subtitle?: string;
    columns: ReportColumn[];
    rows: Record<string, ReportCellValue>[];
  }>;
}

interface BuildDetailedTimecardReportParams {
  entries: TimeEntry[];
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  payPeriodSettings: PayPeriodSettings;
  periodStart: string;
  periodEnd: string;
  now?: Date;
}

interface BuildPeriodReportParams extends BuildDetailedTimecardReportParams {}

interface BreakAllocation {
  durationHours: number;
  paidHours: number;
  unpaidHours: number;
}

const DETAIL_COLUMNS: ReportColumn[] = [
  { key: 'date', label: 'Date', width: 13, format: 'date' },
  { key: 'employee', label: 'Employee', width: 24 },
  { key: 'employeeType', label: 'Employee Type', width: 15 },
  { key: 'property', label: 'Property', width: 22 },
  { key: 'jobCode', label: 'Job Code', width: 12 },
  { key: 'job', label: 'Job', width: 24 },
  { key: 'firstIn', label: 'First In', width: 13, format: 'time', align: 'right' },
  { key: 'lastOut', label: 'Last Out', width: 13, format: 'time', align: 'right' },
  { key: 'shiftLength', label: 'Shift Length', width: 12, format: 'hours', align: 'right' },
  { key: 'paidBreak', label: 'Paid Break', width: 12, format: 'hours', align: 'right' },
  { key: 'unpaidBreak', label: 'Unpaid Break', width: 14, format: 'hours', align: 'right' },
  { key: 'regularHours', label: 'Regular Hours', width: 14, format: 'hours', align: 'right' },
  { key: 'otHours', label: 'OT Hours', width: 11, format: 'hours', align: 'right' },
  { key: 'paidHours', label: 'Paid Hours', width: 12, format: 'hours', align: 'right' },
  { key: 'gpsStatus', label: 'GPS Status', width: 15 },
  { key: 'entryStatus', label: 'Entry Status', width: 13 },
  { key: 'notes', label: 'Notes', width: 55 },
];

export function buildDetailedTimecardReport({
  entries,
  profiles,
  jobSites,
  jobCodes,
  payPeriodSettings,
  periodStart,
  periodEnd,
  now = new Date(),
}: BuildDetailedTimecardReportParams): ReportModel {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const jobById = new Map(jobCodes.map((job) => [job.id, job]));
  const siteById = jobSiteById(jobSites);
  const workEntries = entries
    .filter((entry) => entry.eventType === 'work')
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  const breakAllocations = allocateBreaks(entries, profileById, now);
  const cumulativePaidByUserWeek = new Map<string, number>();

  const rows = workEntries.map((entry) => {
    const profile = profileById.get(entry.userId);
    const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) ?? null : null;
    const site = job?.jobSiteId ? siteById.get(job.jobSiteId) ?? null : null;
    const allocation = breakAllocations.get(entry.id) ?? { durationHours: 0, paidHours: 0, unpaidHours: 0 };
    const shiftLength = getEntryDurationHours(entry, now);
    const paidHours = Math.max(0, shiftLength - allocation.unpaidHours);
    const overtimeKey = `${entry.userId}|${getAtlanticWeekStart(entry.clockIn)}`;
    const currentCumulative = cumulativePaidByUserWeek.get(overtimeKey) ?? 0;
    const threshold = payPeriodSettings.weeklyOvertimeThresholdHours;
    const regularHours = Math.max(0, Math.min(paidHours, threshold - currentCumulative));
    const otHours = Math.max(0, paidHours - regularHours);
    cumulativePaidByUserWeek.set(overtimeKey, currentCumulative + paidHours);

    return {
      date: getAtlanticDateKey(entry.clockIn),
      employee: profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown',
      employeeType: profile ? profileLabel(profile) : 'Unknown',
      property: jobPropertyName(job, site),
      jobCode: job?.code ?? 'Missing',
      job: jobDisplayNameById(entry.jobCodeId, jobById, siteById),
      firstIn: entry.clockIn,
      lastOut: entry.clockOut ?? null,
      shiftLength: roundHours(shiftLength),
      paidBreak: roundHours(allocation.paidHours),
      unpaidBreak: roundHours(allocation.unpaidHours),
      regularHours: roundHours(regularHours),
      otHours: roundHours(otHours),
      paidHours: roundHours(paidHours),
      gpsStatus: gpsStatus(entry),
      entryStatus: entry.clockOut ? 'Closed' : 'Open',
      notes: entry.notes ?? '',
    };
  });

  const totalPaidHours = rows.reduce((total, row) => total + Number(row.paidHours ?? 0), 0);
  const totalRegularHours = rows.reduce((total, row) => total + Number(row.regularHours ?? 0), 0);
  const totalOvertimeHours = rows.reduce((total, row) => total + Number(row.otHours ?? 0), 0);
  const openEntries = workEntries.filter((entry) => !entry.clockOut).length;
  const openBreaks = entries.filter((entry) => entry.eventType === 'break' && !entry.clockOut).length;
  const missingJobCodes = workEntries.filter((entry) => !entry.jobCodeId).length;

  return {
    title: 'Timecard Detail',
    subtitle: `${periodStart} to ${periodEnd} | OT after ${payPeriodSettings.weeklyOvertimeThresholdHours} paid hours/week`,
    columns: DETAIL_COLUMNS,
    rows,
    summary: [
      { label: 'Paid hours', value: `${roundHours(totalPaidHours).toFixed(2)}h` },
      { label: 'Regular hours', value: `${roundHours(totalRegularHours).toFixed(2)}h` },
      { label: 'OT hours', value: `${roundHours(totalOvertimeHours).toFixed(2)}h` },
      { label: 'Open entries', value: openEntries.toString() },
    ],
    exceptions: [
      ...(openEntries > 0 ? [{ severity: 'blocker' as const, message: `${openEntries} open work ${openEntries === 1 ? 'entry' : 'entries'}` }] : []),
      ...(openBreaks > 0 ? [{ severity: 'blocker' as const, message: `${openBreaks} open break ${openBreaks === 1 ? 'entry' : 'entries'}` }] : []),
      ...(missingJobCodes > 0 ? [{ severity: 'review' as const, message: `${missingJobCodes} work ${missingJobCodes === 1 ? 'entry is' : 'entries are'} missing a job code` }] : []),
    ],
  };
}

export function buildHoursByLocationReport(params: BuildPeriodReportParams): ReportModel {
  const detail = buildDetailedTimecardReport(params);
  const profileByName = new Map(params.profiles.map((profile) => [`${profile.firstName} ${profile.lastName}`, profile]));
  const grouped = new Map<string, Record<string, ReportCellValue>>();

  detail.rows.forEach((row) => {
    if (row.entryStatus === 'Open') return;
    const key = `${row.property}|${row.jobCode}|${row.job}|${row.employee}`;
    const profile = profileByName.get(String(row.employee));
    const current = grouped.get(key) ?? {
      property: row.property,
      jobCode: row.jobCode,
      job: row.job,
      employee: row.employee,
      employeeType: row.employeeType,
      regularHours: 0,
      otHours: 0,
      totalHours: 0,
      estPay: 0,
    };
    const regularHours = Number(row.regularHours ?? 0);
    const otHours = Number(row.otHours ?? 0);
    const rate = profile?.hourlyRate ?? 0;
    current.regularHours = roundHours(Number(current.regularHours ?? 0) + regularHours);
    current.otHours = roundHours(Number(current.otHours ?? 0) + otHours);
    current.totalHours = roundHours(Number(current.totalHours ?? 0) + regularHours + otHours);
    current.estPay = roundMoney(Number(current.estPay ?? 0) + regularHours * rate + otHours * rate * 1.5);
    grouped.set(key, current);
  });

  const rows = [...grouped.values()].sort((a, b) => `${a.property}${a.jobCode}${a.employee}`.localeCompare(`${b.property}${b.jobCode}${b.employee}`));
  const totalHours = rows.reduce((total, row) => total + Number(row.totalHours ?? 0), 0);
  const totalPay = rows.reduce((total, row) => total + Number(row.estPay ?? 0), 0);

  return {
    title: 'Hours by Location',
    subtitle: `${params.periodStart} to ${params.periodEnd} | Grouped by property, job, and employee`,
    columns: [
      { key: 'property', label: 'Property', width: 22 },
      { key: 'jobCode', label: 'Job Code', width: 12 },
      { key: 'job', label: 'Job', width: 26 },
      { key: 'employee', label: 'Employee', width: 24 },
      { key: 'employeeType', label: 'Employee Type', width: 15 },
      { key: 'regularHours', label: 'Reg', width: 10, format: 'hours', align: 'right' },
      { key: 'otHours', label: 'OT', width: 10, format: 'hours', align: 'right' },
      { key: 'totalHours', label: 'Total', width: 10, format: 'hours', align: 'right' },
      { key: 'estPay', label: 'Est Pay', width: 13, format: 'currency', align: 'right' },
    ],
    rows,
    summary: [
      { label: 'Rows', value: rows.length.toString() },
      { label: 'Total hours', value: `${roundHours(totalHours).toFixed(2)}h` },
      { label: 'Estimated pay', value: formatMoney(totalPay) },
      { label: 'Open entries excluded', value: detail.exceptions.some((exception) => exception.message.includes('open')) ? 'Yes' : 'No' },
    ],
    exceptions: detail.exceptions,
  };
}

export function buildPayrollSummaryReport(params: BuildPeriodReportParams): ReportModel {
  const hours = buildHoursByLocationReport(params);
  const rows = hours.rows.map((row) => {
    const [firstName, ...lastNameParts] = String(row.employee).split(' ');
    return {
      firstName,
      lastName: lastNameParts.join(' '),
      location: row.property,
      regularHours: row.regularHours,
      otHours: row.otHours,
      totalHours: row.totalHours,
      estPay: row.estPay,
      name: row.employee,
      jobCode: row.jobCode,
      payCycleEnding: params.periodEnd,
      employeeType: row.employeeType,
    };
  });

  const jobCodeRows = buildJobCodeRows(params.jobSites, params.jobCodes);
  const totalHours = rows.reduce((total, row) => total + Number(row.totalHours ?? 0), 0);
  const totalPay = rows.reduce((total, row) => total + Number(row.estPay ?? 0), 0);

  return {
    title: 'Payroll Summary',
    subtitle: `${params.periodStart} to ${params.periodEnd} | Buddy Punch-style payroll export`,
    columns: [
      { key: 'firstName', label: 'First Name', width: 14 },
      { key: 'lastName', label: 'Last Name', width: 18 },
      { key: 'location', label: 'Location', width: 22 },
      { key: 'regularHours', label: 'Reg', width: 10, format: 'hours', align: 'right' },
      { key: 'otHours', label: 'OT', width: 10, format: 'hours', align: 'right' },
      { key: 'totalHours', label: 'Total', width: 10, format: 'hours', align: 'right' },
      { key: 'estPay', label: 'Est Pay', width: 13, format: 'currency', align: 'right' },
      { key: 'name', label: 'Name', width: 24 },
      { key: 'jobCode', label: 'Job Code', width: 12 },
      { key: 'payCycleEnding', label: 'Pay Cycle Ending', width: 16, format: 'date' },
      { key: 'employeeType', label: 'Employee Type', width: 15 },
    ],
    rows,
    summary: [
      { label: 'Rows', value: rows.length.toString() },
      { label: 'Total hours', value: `${roundHours(totalHours).toFixed(2)}h` },
      { label: 'Estimated pay', value: formatMoney(totalPay) },
      { label: 'Job mappings', value: jobCodeRows.length.toString() },
    ],
    exceptions: hours.exceptions,
    sheets: [
      {
        title: 'Job Codes',
        subtitle: 'Property and job code mapping exported with the payroll workbook.',
        columns: [
          { key: 'property', label: 'Property', width: 24 },
          { key: 'jobCode', label: 'Job Code', width: 12 },
          { key: 'job', label: 'Job', width: 28 },
          { key: 'active', label: 'Active?', width: 10 },
          { key: 'archived', label: 'Archived?', width: 10 },
        ],
        rows: jobCodeRows,
      },
    ],
  };
}

function allocateBreaks(entries: TimeEntry[], profileById: Map<string, Profile>, now: Date) {
  const allocations = new Map<string, BreakAllocation>();
  const workEntries = entries.filter((entry) => entry.eventType === 'work');
  const breakEntriesByUserDay = entries
    .filter((entry) => entry.eventType === 'break')
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn))
    .reduce<Map<string, TimeEntry[]>>((groups, entry) => {
      const key = `${entry.userId}|${getAtlanticDateKey(entry.clockIn)}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
      return groups;
    }, new Map());

  workEntries.forEach((entry) => {
    allocations.set(entry.id, { durationHours: 0, paidHours: 0, unpaidHours: 0 });
  });

  breakEntriesByUserDay.forEach((breakEntries) => {
    let paidBreakUsedByProfile = new Map<string, number>();

    breakEntries.forEach((breakEntry) => {
      const profile = profileById.get(breakEntry.userId);
      const attributedWorkEntry = findAttributedWorkEntry(workEntries, breakEntry);
      if (!attributedWorkEntry) return;

      const durationHours = getEntryDurationHours(breakEntry, now);
      const paidLimit = profile?.paidBreaks ? Math.max(0, profile.paidBreakMinutes / 60) : 0;
      const paidUsed = paidBreakUsedByProfile.get(breakEntry.userId) ?? 0;
      const paidHours = Math.max(0, Math.min(durationHours, paidLimit - paidUsed));
      const unpaidHours = Math.max(0, durationHours - paidHours);
      paidBreakUsedByProfile = new Map(paidBreakUsedByProfile).set(breakEntry.userId, paidUsed + paidHours);

      const current = allocations.get(attributedWorkEntry.id) ?? { durationHours: 0, paidHours: 0, unpaidHours: 0 };
      allocations.set(attributedWorkEntry.id, {
        durationHours: current.durationHours + durationHours,
        paidHours: current.paidHours + paidHours,
        unpaidHours: current.unpaidHours + unpaidHours,
      });
    });
  });

  return allocations;
}

function findAttributedWorkEntry(workEntries: TimeEntry[], breakEntry: TimeEntry) {
  const breakStart = new Date(breakEntry.clockIn).getTime();
  const sameUserWorkEntries = workEntries
    .filter((entry) => entry.userId === breakEntry.userId)
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  return sameUserWorkEntries.find((entry) => {
    const start = new Date(entry.clockIn).getTime();
    const end = entry.clockOut ? new Date(entry.clockOut).getTime() : Number.POSITIVE_INFINITY;
    return breakStart >= start && breakStart <= end;
  }) ?? [...sameUserWorkEntries].reverse().find((entry) => entry.clockIn <= breakEntry.clockIn) ?? null;
}

function profileLabel(profile: Profile) {
  if (profile.role === 'admin') return 'Admin';
  return profile.workerType === 'contractor' ? 'Contractor' : 'Employee';
}

function gpsStatus(entry: TimeEntry) {
  if (!entry.clockInLat || (entry.clockOut && !entry.clockOutLat)) return 'No GPS';
  return 'GPS Captured';
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(value);
}

function buildJobCodeRows(jobSites: JobSite[], jobCodes: JobCode[]) {
  const siteById = jobSiteById(jobSites);
  return jobCodes
    .map((job) => {
      const site = job.jobSiteId ? siteById.get(job.jobSiteId) : null;
      return {
        property: site?.name ?? 'No property',
        jobCode: job.code ?? '',
        job: job.name,
        active: job.isActive ? 'Yes' : 'No',
        archived: job.isArchived ? 'Yes' : 'No',
      };
    })
    .sort((a, b) => `${a.property}${a.jobCode}${a.job}`.localeCompare(`${b.property}${b.jobCode}${b.job}`));
}
