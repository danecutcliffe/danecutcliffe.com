import type { JobCode, JobSite, Profile, TimeEntry } from '../domain/types';
import { jobDisplayName, jobSiteById } from './jobs';
import { calculateTimesheetSummary, formatAtlanticDateTime, getAtlanticDateKey, getEntryDurationHours, getEntryPayableHours } from './time';

const detailedHeaders = ['Date', 'Employee', 'Property', 'Job Code', 'Job', 'Clock In', 'Clock Out', 'Hours', 'Break Hours', 'Net Hours', 'GPS Status', 'Notes'];
const qboHeaders = ['TxnDate', 'Name', 'Time', 'StartTime', 'EndTime', 'Description', 'BillableStatus', 'Customer', 'ServiceItem', 'HourlyRate', 'Taxable', 'Class', 'Location'];

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

function employeeName(profile?: Profile) {
  return profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown Employee';
}

function getGpsStatus(entry: TimeEntry): string {
  const clockInMissing = entry.clockInLat === null || entry.clockInLat === undefined;
  const clockOutMissing = entry.clockOut && (entry.clockOutLat === null || entry.clockOutLat === undefined);
  return clockInMissing || clockOutMissing ? 'No GPS' : 'GPS Captured';
}

export function buildDetailedCsv(params: {
  entries: TimeEntry[];
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  now?: Date;
}): string {
  const profileById = new Map(params.profiles.map((profile) => [profile.id, profile]));
  const jobById = new Map(params.jobCodes.map((job) => [job.id, job]));
  const siteById = jobSiteById(params.jobSites);
  const rows = params.entries.map((entry) => {
    const profile = profileById.get(entry.userId);
    const job = entry.jobCodeId ? jobById.get(entry.jobCodeId) : undefined;
    const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : undefined;
    const summary = calculateTimesheetSummary([entry], profile?.hourlyRate ?? 0, params.now, { paidBreaks: profile?.paidBreaks ?? false, paidBreakMinutes: profile?.paidBreakMinutes ?? 30 });
    return [
      getAtlanticDateKey(entry.clockIn),
      employeeName(profile),
      entry.eventType === 'break' ? '' : (site?.name ?? ''),
      entry.eventType === 'break' ? 'Break' : (job?.code ?? job?.name ?? ''),
      entry.eventType === 'break' ? 'Break' : jobDisplayName(job, site),
      formatAtlanticDateTime(entry.clockIn),
      entry.clockOut ? formatAtlanticDateTime(entry.clockOut) : 'In progress',
      getEntryDurationHours(entry, params.now).toFixed(2),
      summary.breakHours.toFixed(2),
      summary.netWorkHours.toFixed(2),
      getGpsStatus(entry),
      entry.notes ?? '',
    ];
  });
  return toCsv(detailedHeaders, rows);
}

export function buildQboCsv(params: {
  entries: TimeEntry[];
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  now?: Date;
}): string {
  const profileById = new Map(params.profiles.map((profile) => [profile.id, profile]));
  const jobById = new Map(params.jobCodes.map((job) => [job.id, job]));
  const siteById = jobSiteById(params.jobSites);
  const groupedMinutes = new Map<string, { employeeName: string; date: string; propertyName: string; jobName: string; minutes: number; notes: string[]; rate: number }>();

  params.entries.forEach((entry) => {
    if (!entry.jobCodeId) return;
    const profile = profileById.get(entry.userId);
    const job = jobById.get(entry.jobCodeId);
    const site = job?.jobSiteId ? siteById.get(job.jobSiteId) : undefined;
    const date = getAtlanticDateKey(entry.clockIn);
    const key = `${entry.userId}|${date}|${entry.jobCodeId}`;
    const existing = groupedMinutes.get(key) ?? {
      employeeName: employeeName(profile),
      date,
      propertyName: site?.name ?? '',
      jobName: job?.code ?? job?.name ?? '',
      minutes: 0,
      notes: [],
      rate: profile?.hourlyRate ?? 0,
    };
    existing.minutes += Math.round(getEntryPayableHours(entry, params.now, { paidBreaks: profile?.paidBreaks ?? false, paidBreakMinutes: profile?.paidBreakMinutes ?? 30 }) * 60);
    if (entry.notes && entry.eventType === 'work') existing.notes.push(entry.notes);
    groupedMinutes.set(key, existing);
  });

  const rows = Array.from(groupedMinutes.values())
    .filter((row) => row.minutes > 0)
    .sort((a, b) => `${a.employeeName}|${a.date}|${a.jobName}`.localeCompare(`${b.employeeName}|${b.date}|${b.jobName}`))
    .map((row) => [
      row.date,
      row.employeeName,
      (row.minutes / 60).toFixed(2),
      '',
      '',
      row.notes.join(' | '),
      'Billable',
      row.propertyName,
      row.jobName,
      row.rate ? row.rate.toFixed(2) : '',
      'FALSE',
      '',
      '',
    ]);
  return toCsv(qboHeaders, rows);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
