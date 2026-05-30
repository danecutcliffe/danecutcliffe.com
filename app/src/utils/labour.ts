import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { jobSiteById } from './jobs';
import { addDaysToDateKey, calculateTimesheetSummary, dayDiff, getAtlanticDateKey, getEntryDurationHours } from './time';

export interface GrossUpScheduleEntry {
  effectiveDate: string;
  multiplier: number;
}

export interface LabourCostEmployeeBreakdown {
  profileId: string;
  employeeName: string;
  grossPay: number;
  loadedCost: number;
}

export interface LabourCostJobBreakdown {
  jobCodeId: string | null;
  jobCodeLabel: string;
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  workHours: number;
  employees: LabourCostEmployeeBreakdown[];
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
  grossUpSchedule: GrossUpScheduleEntry[];
  selectedJobCodeId?: string;
  now?: Date;
}

interface BuildLabourCostBreakdownAcrossPayPeriodsParams extends BuildLabourCostBreakdownParams {
  payPeriodSettings: PayPeriodSettings;
}

interface EmployeeAggregate extends LabourCostEmployeeBreakdown {}

interface JobAggregate {
  jobCodeId: string | null;
  jobCodeLabel: string;
  grossPay: number;
  loadedCost: number;
  payableHours: number;
  workHours: number;
  employees: Map<string, EmployeeAggregate>;
}

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
  grossUpSchedule,
  selectedJobCodeId,
  now = new Date(),
}: BuildLabourCostBreakdownParams): LabourCostBreakdown {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const jobById = new Map(jobCodes.map((job) => [job.id, job]));
  const siteById = jobSiteById(jobSites);
  const entriesByUser = groupEntriesByUser(entries);
  const propertyMap = new Map<string, PropertyAggregate>();

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
    const workerCostMultiplier = weightedWorkerMultiplier(includedWorkEntries, profile, grossUpSchedule, now);
    const includedGrossPay = summary.grossPay * (includedWorkHours / totalWorkHours);

    employeeCount += 1;
    grossPay += includedGrossPay;
    loadedCost += includedGrossPay * workerCostMultiplier;
    payableHours += summary.netWorkHours * (includedWorkHours / totalWorkHours);
    overtimeHours += summary.overtimeHours * (includedWorkHours / totalWorkHours);

    const jobHours = new Map<string, { jobCodeId: string | null; workHours: number; weightedMultSum: number }>();
    includedWorkEntries.forEach((entry) => {
      const key = entry.jobCodeId ?? NO_JOB_KEY;
      const current = jobHours.get(key);
      const hours = getEntryDurationHours(entry, now);
      const entryMultiplier = labourCostMultiplierForProfile(profile, multiplierForDate(grossUpSchedule, getAtlanticDateKey(entry.clockIn)));
      if (current) {
        current.workHours += hours;
        current.weightedMultSum += hours * entryMultiplier;
      } else {
        jobHours.set(key, { jobCodeId: entry.jobCodeId, workHours: hours, weightedMultSum: hours * entryMultiplier });
      }
    });

    jobHours.forEach(({ jobCodeId, workHours: jobWorkHours, weightedMultSum }, jobKey) => {
      const job = jobCodeId ? jobById.get(jobCodeId) ?? null : null;
      const site = job?.jobSiteId ? siteById.get(job.jobSiteId) ?? null : null;
      const propertyId = site?.id ?? NO_PROPERTY_ID;
      const propertyName = site?.name ?? NO_PROPERTY_NAME;
      const jobShare = jobWorkHours / totalWorkHours;
      const jobGrossPay = summary.grossPay * jobShare;
      const jobWeightedMultiplier = jobWorkHours > 0 ? weightedMultSum / jobWorkHours : workerCostMultiplier;
      const jobLoadedCost = jobGrossPay * jobWeightedMultiplier;
      const jobPayableHours = summary.netWorkHours * jobShare;
      const employeeName = profileDisplayName(profile);

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
        addEmployeeContribution(currentJob.employees, profile.id, employeeName, jobGrossPay, jobLoadedCost);
      } else {
        const employees = new Map<string, EmployeeAggregate>();
        addEmployeeContribution(employees, profile.id, employeeName, jobGrossPay, jobLoadedCost);
        property.jobs.set(jobKey, {
          jobCodeId,
          jobCodeLabel: jobReportLabel(job),
          grossPay: jobGrossPay,
          loadedCost: jobLoadedCost,
          payableHours: jobPayableHours,
          workHours: jobWorkHours,
          employees,
        });
      }
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
      jobs: Array.from(property.jobs.values())
        .map((job) => ({
          ...job,
          employees: Array.from(job.employees.values()).sort((a, b) => b.grossPay - a.grossPay || a.employeeName.localeCompare(b.employeeName)),
        }))
        .sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.jobCodeLabel.localeCompare(b.jobCodeLabel)),
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
          sourceJob.employees.forEach((employee) => {
            addEmployeeContribution(job.employees, employee.profileId, employee.employeeName, employee.grossPay, employee.loadedCost);
          });
        } else {
          property.jobs.set(jobKey, {
            ...sourceJob,
            employees: new Map(sourceJob.employees.map((employee) => [employee.profileId, { ...employee }])),
          });
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
      jobs: Array.from(property.jobs.values())
        .map((job) => ({
          ...job,
          employees: Array.from(job.employees.values()).sort((a, b) => b.grossPay - a.grossPay || a.employeeName.localeCompare(b.employeeName)),
        }))
        .sort((a, b) => b.loadedCost - a.loadedCost || b.workHours - a.workHours || a.jobCodeLabel.localeCompare(b.jobCodeLabel)),
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

function labourCostMultiplierForProfile(profile: Profile, employeeMultiplier: number) {
  if (profile.workerType === 'contractor') return profile.contractorHstApplicable ? 1.15 : 1;
  return employeeMultiplier;
}

function multiplierForDate(schedule: GrossUpScheduleEntry[], dateKey: string): number {
  if (!schedule.length) return 1.25;
  const sorted = [...schedule].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  let result = sorted[0].multiplier;
  for (const entry of sorted) {
    if (entry.effectiveDate <= dateKey) {
      result = entry.multiplier;
    } else {
      break;
    }
  }
  return result;
}

function weightedWorkerMultiplier(entries: TimeEntry[], profile: Profile, schedule: GrossUpScheduleEntry[], now: Date): number {
  let weighted = 0;
  let totalHours = 0;
  for (const entry of entries) {
    const hours = getEntryDurationHours(entry, now);
    if (hours <= 0) continue;
    const base = multiplierForDate(schedule, getAtlanticDateKey(entry.clockIn));
    weighted += hours * labourCostMultiplierForProfile(profile, base);
    totalHours += hours;
  }
  if (totalHours <= 0) {
    return labourCostMultiplierForProfile(profile, multiplierForDate(schedule, getAtlanticDateKey(now.toISOString())));
  }
  return weighted / totalHours;
}

function profileDisplayName(profile: Profile) {
  return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
}

function jobReportLabel(job: JobCode | null | undefined) {
  if (!job) return 'No job code';
  return job.code ? `${job.code} ${job.name}` : job.name;
}

function addEmployeeContribution(
  employees: Map<string, EmployeeAggregate>,
  profileId: string,
  employeeName: string,
  grossPay: number,
  loadedCost: number,
) {
  const current = employees.get(profileId);
  if (current) {
    current.grossPay += grossPay;
    current.loadedCost += loadedCost;
  } else {
    employees.set(profileId, { profileId, employeeName, grossPay, loadedCost });
  }
}
