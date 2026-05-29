import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { jobDisplayName, jobSiteById } from './jobs';
import { addDaysToDateKey, calculateTimesheetSummary, dayDiff, getAtlanticDateKey, getEntryDurationHours } from './time';

export interface LabourCostJobBreakdown {
  jobCodeId: string | null;
  jobCodeLabel: string;
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  workHours: number;
}

export interface LabourCostPropertyBreakdown {
  propertyId: string;
  propertyName: string;
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  workHours: number;
  jobs: LabourCostJobBreakdown[];
}

export interface LabourCostBreakdown {
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  overtimeHours: number;
  employeeCount: number;
  propertyCount: number;
  jobCount: number;
  properties: LabourCostPropertyBreakdown[];
}

interface BuildLabourCostBreakdownParams {
  entries: TimeEntry[];
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  laborCostMultiplier: number;
  selectedJobCodeId?: string;
  now?: Date;
}

interface BuildLabourCostBreakdownAcrossPayPeriodsParams extends BuildLabourCostBreakdownParams {
  payPeriodSettings: PayPeriodSettings;
}

interface JobAggregate extends LabourCostJobBreakdown {}

interface PropertyAggregate {
  propertyId: string;
  propertyName: string;
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  workHours: number;
  jobs: Map<string, JobAggregate>;
}

const NO_PROPERTY_ID = 'no-property';
const NO_PROPERTY_NAME = 'No property';
const NO_JOB_KEY = 'no-job-code';

export function buildLabourCostBreakdown({
  entries,
  profiles,
  jobSites,
  jobCodes,
  laborCostMultiplier,
  selectedJobCodeId,
  now = new Date(),
}: BuildLabourCostBreakdownParams): LabourCostBreakdown {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const jobById = new Map(jobCodes.map((job) => [job.id, job]));
  const siteById = jobSiteById(jobSites);
  const entriesByUser = groupEntriesByUser(entries);
  const propertyMap = new Map<string, PropertyAggregate>();
  const multiplier = Number.isFinite(laborCostMultiplier) && laborCostMultiplier >= 1 ? laborCostMultiplier : 1.25;

  let grossPay = 0;
  let loadedCost = 0;
  let payableHours = 0;
  let overtimeHours = 0;
  let employeeCount = 0;

  entriesByUser.forEach((employeeEntries, userId) => {
    const profile = profileById.get(userId);
    if (!profile || profile.role !== 'employee') return;

    const workEntries = employeeEntries.filter((entry) => entry.eventType === 'work');
    const totalWorkHours = sumEntryHours(workEntries, now);
    if (totalWorkHours <= 0) return;

    const includedWorkEntries = selectedJobCodeId
      ? workEntries.filter((entry) => entry.jobCodeId === selectedJobCodeId)
      : workEntries;
    const includedWorkHours = sumEntryHours(includedWorkEntries, now);
    if (includedWorkHours <= 0) return;

    const summary = calculateTimesheetSummary(employeeEntries, profile.hourlyRate, now, {
      paidBreaks: profile.paidBreaks,
      paidBreakMinutes: profile.paidBreakMinutes,
    });

    employeeCount += 1;
    grossPay += summary.grossPay * (includedWorkHours / totalWorkHours);
    payableHours += summary.netWorkHours * (includedWorkHours / totalWorkHours);
    overtimeHours += summary.overtimeHours * (includedWorkHours / totalWorkHours);

    const jobHours = new Map<string, { jobCodeId: string | null; workHours: number }>();
    includedWorkEntries.forEach((entry) => {
      const key = entry.jobCodeId ?? NO_JOB_KEY;
      const current = jobHours.get(key);
      const hours = getEntryDurationHours(entry, now);
      if (current) {
        current.workHours += hours;
      } else {
        jobHours.set(key, { jobCodeId: entry.jobCodeId, workHours: hours });
      }
    });

    jobHours.forEach(({ jobCodeId, workHours: jobWorkHours }, jobKey) => {
      const job = jobCodeId ? jobById.get(jobCodeId) ?? null : null;
      const site = job?.jobSiteId ? siteById.get(job.jobSiteId) ?? null : null;
      const propertyId = site?.id ?? NO_PROPERTY_ID;
      const propertyName = site?.name ?? NO_PROPERTY_NAME;
      const jobShare = jobWorkHours / totalWorkHours;
      const jobGrossPay = summary.grossPay * jobShare;
      const jobLoadedCost = jobGrossPay * multiplier;
      const jobPayableHours = summary.netWorkHours * jobShare;

      let property = propertyMap.get(propertyId);
      if (!property) {
        property = {
          propertyId,
          propertyName,
          grossPay: 0,
          loadedCost: 0,
          payableHours: 0,
          workHours: 0,
          jobs: new Map<string, JobAggregate>(),
        };
        propertyMap.set(propertyId, property);
      }

      property.grossPay += jobGrossPay;
      property.loadedCost += jobLoadedCost;
      property.payableHours += jobPayableHours;
      property.workHours += jobWorkHours;

      const currentJob = property.jobs.get(jobKey);
      if (currentJob) {
        currentJob.grossPay += jobGrossPay;
        currentJob.loadedCost += jobLoadedCost;
        currentJob.payableHours += jobPayableHours;
        currentJob.workHours += jobWorkHours;
      } else {
        property.jobs.set(jobKey, {
          jobCodeId,
          jobCodeLabel: jobDisplayName(job, site),
          grossPay: jobGrossPay,
          loadedCost: jobLoadedCost,
          payableHours: jobPayableHours,
          workHours: jobWorkHours,
        });
      }
    });
  });

  loadedCost = grossPay * multiplier;

  const properties = Array.from(propertyMap.values())
    .map<LabourCostPropertyBreakdown>((property) => ({
      propertyId: property.propertyId,
      propertyName: property.propertyName,
      grossPay: property.grossPay,
      loadedCost: property.loadedCost,
      payableHours: property.payableHours,
      workHours: property.workHours,
      jobs: Array.from(property.jobs.values()).sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.jobCodeLabel.localeCompare(b.jobCodeLabel)),
    }))
    .sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.propertyName.localeCompare(b.propertyName));

  return {
    grossPay,
    loadedCost,
    payableHours,
    overtimeHours,
    employeeCount,
    propertyCount: properties.length,
    jobCount: properties.reduce((total, property) => total + property.jobs.length, 0),
    properties,
  };
}

export function buildLabourCostBreakdownAcrossPayPeriods({
  payPeriodSettings,
  ...params
}: BuildLabourCostBreakdownAcrossPayPeriodsParams): LabourCostBreakdown {
  const periods = groupEntriesByPayPeriod(params.entries, payPeriodSettings);
  const breakdowns = Array.from(periods.values()).map((periodEntries) => buildLabourCostBreakdown({ ...params, entries: periodEntries }));
  const merged = mergeLabourCostBreakdowns(breakdowns);

  return {
    ...merged,
    employeeCount: countEmployeesWithIncludedWork(params.entries, params.profiles, params.selectedJobCodeId, params.now ?? new Date()),
  };
}

function groupEntriesByUser(entries: TimeEntry[]) {
  return entries.reduce<Map<string, TimeEntry[]>>((groups, entry) => {
    const current = groups.get(entry.userId);
    if (current) {
      current.push(entry);
    } else {
      groups.set(entry.userId, [entry]);
    }
    return groups;
  }, new Map());
}

function groupEntriesByPayPeriod(entries: TimeEntry[], settings: PayPeriodSettings) {
  const anchorStart = settings.anchorStart;
  const lengthDays = Number.isFinite(settings.lengthDays) && settings.lengthDays >= 1 ? settings.lengthDays : 14;

  return entries.reduce<Map<string, TimeEntry[]>>((groups, entry) => {
    const entryDate = getAtlanticDateKey(entry.clockIn);
    const periodOffset = Math.floor(dayDiff(anchorStart, entryDate) / lengthDays) * lengthDays;
    const periodStart = addDaysToDateKey(anchorStart, periodOffset);
    const current = groups.get(periodStart);
    if (current) {
      current.push(entry);
    } else {
      groups.set(periodStart, [entry]);
    }
    return groups;
  }, new Map());
}

function mergeLabourCostBreakdowns(breakdowns: LabourCostBreakdown[]): LabourCostBreakdown {
  const propertyMap = new Map<string, PropertyAggregate>();
  let grossPay = 0;
  let loadedCost = 0;
  let payableHours = 0;
  let overtimeHours = 0;
  let employeeCount = 0;

  breakdowns.forEach((breakdown) => {
    grossPay += breakdown.grossPay;
    loadedCost += breakdown.loadedCost;
    payableHours += breakdown.payableHours;
    overtimeHours += breakdown.overtimeHours;
    employeeCount += breakdown.employeeCount;

    breakdown.properties.forEach((sourceProperty) => {
      let property = propertyMap.get(sourceProperty.propertyId);
      if (!property) {
        property = {
          propertyId: sourceProperty.propertyId,
          propertyName: sourceProperty.propertyName,
          grossPay: 0,
          loadedCost: 0,
          payableHours: 0,
          workHours: 0,
          jobs: new Map<string, JobAggregate>(),
        };
        propertyMap.set(sourceProperty.propertyId, property);
      }

      property.grossPay += sourceProperty.grossPay;
      property.loadedCost += sourceProperty.loadedCost;
      property.payableHours += sourceProperty.payableHours;
      property.workHours += sourceProperty.workHours;

      sourceProperty.jobs.forEach((sourceJob) => {
        const jobKey = `${sourceJob.jobCodeId ?? NO_JOB_KEY}|${sourceJob.jobCodeLabel}`;
        const job = property.jobs.get(jobKey);
        if (job) {
          job.grossPay += sourceJob.grossPay;
          job.loadedCost += sourceJob.loadedCost;
          job.payableHours += sourceJob.payableHours;
          job.workHours += sourceJob.workHours;
        } else {
          property.jobs.set(jobKey, { ...sourceJob });
        }
      });
    });
  });

  const properties = Array.from(propertyMap.values())
    .map<LabourCostPropertyBreakdown>((property) => ({
      propertyId: property.propertyId,
      propertyName: property.propertyName,
      grossPay: property.grossPay,
      loadedCost: property.loadedCost,
      payableHours: property.payableHours,
      workHours: property.workHours,
      jobs: Array.from(property.jobs.values()).sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.jobCodeLabel.localeCompare(b.jobCodeLabel)),
    }))
    .sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.propertyName.localeCompare(b.propertyName));

  return {
    grossPay,
    loadedCost,
    payableHours,
    overtimeHours,
    employeeCount,
    propertyCount: properties.length,
    jobCount: properties.reduce((total, property) => total + property.jobs.length, 0),
    properties,
  };
}

function countEmployeesWithIncludedWork(entries: TimeEntry[], profiles: Profile[], selectedJobCodeId: string | undefined, now: Date) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const employeeIds = new Set<string>();

  entries.forEach((entry) => {
    const profile = profileById.get(entry.userId);
    if (profile?.role !== 'employee') return;
    if (entry.eventType !== 'work') return;
    if (selectedJobCodeId && entry.jobCodeId !== selectedJobCodeId) return;
    if (getEntryDurationHours(entry, now) <= 0) return;
    employeeIds.add(entry.userId);
  });

  return employeeIds.size;
}

function sumEntryHours(entries: TimeEntry[], now: Date) {
  return entries.reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
}
