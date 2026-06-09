import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { jobSiteById } from './jobs';
import { addDaysToDateKey, dayDiff, getAtlanticDateKey, getEntryDurationHours } from './time';
import { computeEntryHours } from './timecardHours';
import { calculateLoadedPayrollCost, calculatePayrollGrossPay, roundHours, roundMoney } from './payrollRounding';

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
  // Unpaid break time that payroll deducted but could not be attached to any work
  // entry (impossible-but-representable data). Surfaced so totals are never silently
  // off; expected to be 0.
  unattributedBreakHours: number;
}

interface BuildLabourCostBreakdownParams {
  entries: TimeEntry[];
  profiles: Profile[];
  jobSites: JobSite[];
  jobCodes: JobCode[];
  grossUpSchedule: GrossUpScheduleEntry[];
  selectedJobCodeId?: string;
  weeklyOvertimeThresholdHours?: number;
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
  weeklyOvertimeThresholdHours,
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
  let unattributedBreakHours = 0;

  entriesByUser.forEach((employeeEntries, userId) => {
    const profile = profileById.get(userId);
    if (!profile || profile.role !== 'employee') return;

    const rate = profile.hourlyRate;
    const { byEntryId, unattributedBreakHours: employeeUnattributedBreakHours } = computeEntryHours(
      employeeEntries,
      profileById,
      weeklyOvertimeThresholdHours,
      now,
    );
    unattributedBreakHours += employeeUnattributedBreakHours;

    const workEntries = employeeEntries.filter((entry) => entry.eventType === 'work');
    const includedWorkEntries = selectedJobCodeId
      ? workEntries.filter((entry) => entry.jobCodeId === selectedJobCodeId)
      : workEntries;

    // Cost each included work entry directly from its own regular/overtime split
    // (overtime was attributed chronologically across the full employee-week inside
    // computeEntryHours), apply the entry-date gross-up multiplier, then aggregate by
    // job code. No gross-pay apportionment: a job's cost equals the hours actually
    // worked on it, so it reconciles to that job's timecard rows.
    const jobAgg = new Map<string, { jobCodeId: string | null; grossHours: number; netHours: number; otHours: number; grossPay: number; loadedCost: number }>();
    let employeeGrossHours = 0;

    includedWorkEntries.forEach((entry) => {
      const hours = byEntryId.get(entry.id);
      if (!hours) return;
      const entryMultiplier = labourCostMultiplierForProfile(profile, multiplierForDate(grossUpSchedule, getAtlanticDateKey(entry.clockIn)));
      const entryDurationHours = roundHours(hours.durationHours);
      const entryPaidHours = roundHours(hours.paidHours);
      const entryOtHours = roundHours(hours.otHours);
      const entryGrossPay = calculatePayrollGrossPay({ regularHours: hours.regularHours, overtimeHours: hours.otHours, hourlyRate: rate });
      const entryLoadedCost = calculateLoadedPayrollCost(entryGrossPay, entryMultiplier);
      const key = entry.jobCodeId ?? NO_JOB_KEY;
      const agg = jobAgg.get(key) ?? { jobCodeId: entry.jobCodeId, grossHours: 0, netHours: 0, otHours: 0, grossPay: 0, loadedCost: 0 };
      agg.grossHours = roundHours(agg.grossHours + entryDurationHours);
      agg.netHours = roundHours(agg.netHours + entryPaidHours);
      agg.otHours = roundHours(agg.otHours + entryOtHours);
      agg.grossPay = roundMoney(agg.grossPay + entryGrossPay);
      agg.loadedCost = roundMoney(agg.loadedCost + entryLoadedCost);
      jobAgg.set(key, agg);
      employeeGrossHours = roundHours(employeeGrossHours + entryDurationHours);
    });

    if (employeeGrossHours <= 0) return;

    employeeCount += 1;
    const employeeName = profileDisplayName(profile);

    jobAgg.forEach((agg, jobKey) => {
      const job = agg.jobCodeId ? jobById.get(agg.jobCodeId) ?? null : null;
      const site = job?.jobSiteId ? siteById.get(job.jobSiteId) ?? null : null;
      const propertyId = site?.id ?? NO_PROPERTY_ID;
      const propertyName = site?.name ?? NO_PROPERTY_NAME;
      const jobGrossPay = agg.grossPay;
      const jobLoadedCost = agg.loadedCost;
      const jobPayableHours = agg.netHours;
      const jobWorkHours = agg.grossHours;

      grossPay = roundMoney(grossPay + jobGrossPay);
      loadedCost = roundMoney(loadedCost + jobLoadedCost);
      payableHours = roundHours(payableHours + jobPayableHours);
      overtimeHours = roundHours(overtimeHours + agg.otHours);

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

      property.grossPay = roundMoney(property.grossPay + jobGrossPay);
      property.loadedCost = roundMoney(property.loadedCost + jobLoadedCost);
      property.payableHours = roundHours(property.payableHours + jobPayableHours);
      property.workHours = roundHours(property.workHours + jobWorkHours);

      const currentJob = property.jobs.get(jobKey);
      if (currentJob) {
        currentJob.grossPay = roundMoney(currentJob.grossPay + jobGrossPay);
        currentJob.loadedCost = roundMoney(currentJob.loadedCost + jobLoadedCost);
        currentJob.payableHours = roundHours(currentJob.payableHours + jobPayableHours);
        currentJob.workHours = roundHours(currentJob.workHours + jobWorkHours);
        addEmployeeContribution(currentJob.employees, profile.id, employeeName, jobGrossPay, jobLoadedCost);
      } else {
        const employees = new Map<string, EmployeeAggregate>();
        addEmployeeContribution(employees, profile.id, employeeName, jobGrossPay, jobLoadedCost);
        property.jobs.set(jobKey, {
          jobCodeId: agg.jobCodeId,
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
          employees: sortEmployeeBreakdownsByLoadedCost(job.employees),
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
    unattributedBreakHours,
  };
}

export function buildLabourCostBreakdownAcrossPayPeriods({
  payPeriodSettings,
  ...params
}: BuildLabourCostBreakdownAcrossPayPeriodsParams): LabourCostBreakdown {
  const periods = groupEntriesByPayPeriod(params.entries, payPeriodSettings);
  const breakdowns = Array.from(periods.values()).map((periodEntries) => buildLabourCostBreakdown({
    ...params,
    entries: periodEntries,
    weeklyOvertimeThresholdHours: payPeriodSettings.weeklyOvertimeThresholdHours,
  }));
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
  let unattributedBreakHours = 0;

  breakdowns.forEach((breakdown) => {
    grossPay = roundMoney(grossPay + breakdown.grossPay);
    loadedCost = roundMoney(loadedCost + breakdown.loadedCost);
    payableHours = roundHours(payableHours + breakdown.payableHours);
    overtimeHours = roundHours(overtimeHours + breakdown.overtimeHours);
    employeeCount += breakdown.employeeCount;
    unattributedBreakHours += breakdown.unattributedBreakHours;

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

      property.grossPay = roundMoney(property.grossPay + sourceProperty.grossPay);
      property.loadedCost = roundMoney(property.loadedCost + sourceProperty.loadedCost);
      property.payableHours = roundHours(property.payableHours + sourceProperty.payableHours);
      property.workHours = roundHours(property.workHours + sourceProperty.workHours);

      sourceProperty.jobs.forEach((sourceJob) => {
        const jobKey = `${sourceJob.jobCodeId ?? NO_JOB_KEY}|${sourceJob.jobCodeLabel}`;
        const job = property.jobs.get(jobKey);
        if (job) {
          job.grossPay = roundMoney(job.grossPay + sourceJob.grossPay);
          job.loadedCost = roundMoney(job.loadedCost + sourceJob.loadedCost);
          job.payableHours = roundHours(job.payableHours + sourceJob.payableHours);
          job.workHours = roundHours(job.workHours + sourceJob.workHours);
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
          employees: sortEmployeeBreakdownsByLoadedCost(job.employees),
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
    unattributedBreakHours,
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
    current.grossPay = roundMoney(current.grossPay + grossPay);
    current.loadedCost = roundMoney(current.loadedCost + loadedCost);
  } else {
    employees.set(profileId, { profileId, employeeName, grossPay: roundMoney(grossPay), loadedCost: roundMoney(loadedCost) });
  }
}

function sortEmployeeBreakdownsByLoadedCost(employees: Map<string, EmployeeAggregate>) {
  return Array.from(employees.values()).sort((a, b) => b.loadedCost - a.loadedCost || a.employeeName.localeCompare(b.employeeName));
}
