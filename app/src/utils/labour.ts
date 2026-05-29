import type { JobCode, JobSite, Profile, TimeEntry } from '../domain/types';
import { jobDisplayName, jobSiteById } from './jobs';
import { calculateTimesheetSummary, getEntryDurationHours } from './time';

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

function sumEntryHours(entries: TimeEntry[], now: Date) {
  return entries.reduce((total, entry) => total + getEntryDurationHours(entry, now), 0);
}
