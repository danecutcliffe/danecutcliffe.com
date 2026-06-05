import type { PayPeriodSettings, Profile, TimeEntry } from '../domain/types';
import { roundHours } from './payrollRounding';
import { computeEntryHours } from './timecardHours';

export interface PayrollExportReadiness {
  blockers: string[];
  warnings: string[];
  acceptableExclusions: string[];
}

export function buildPayrollExportReadiness(
  entries: TimeEntry[],
  profileById: Map<string, Profile>,
  payPeriodSettings: Pick<PayPeriodSettings, 'weeklyOvertimeThresholdHours'>,
  now = new Date(),
): PayrollExportReadiness {
  const openWorkCount = entries.filter((entry) => entry.eventType === 'work' && !entry.clockOut).length;
  const openBreakCount = entries.filter((entry) => entry.eventType === 'break' && !entry.clockOut).length;
  const missingJobCount = entries.filter((entry) => entry.eventType === 'work' && !entry.jobCodeId).length;
  const missingProfileCount = entries.filter((entry) => !profileById.has(entry.userId)).length;
  const inactiveNames = uniqueNames(entries
    .map((entry) => profileById.get(entry.userId))
    .filter((profile): profile is Profile => profile !== undefined && !profile.isActive));
  const missingRateNames = uniqueNames(entries
    .filter((entry) => entry.eventType === 'work')
    .map((entry) => profileById.get(entry.userId))
    .filter((profile): profile is Profile => profile !== undefined && profile.role === 'employee' && profile.hourlyRate <= 0));
  const hoursResult = computeEntryHours(entries, profileById, payPeriodSettings.weeklyOvertimeThresholdHours, now);

  return {
    blockers: [
      ...(missingJobCount > 0 ? [`${missingJobCount} work ${missingJobCount === 1 ? 'entry is' : 'entries are'} missing a job code`] : []),
      ...(missingProfileCount > 0 ? [`${missingProfileCount} ${missingProfileCount === 1 ? 'entry has' : 'entries have'} no employee profile`] : []),
      ...(missingRateNames.length > 0 ? [`Missing pay rate: ${missingRateNames.join(', ')}`] : []),
    ],
    warnings: [
      ...(hoursResult.unattributedBreakHours > 0 ? [`${roundHours(hoursResult.unattributedBreakHours).toFixed(2)}h of unpaid break time could not be matched to a work entry`] : []),
      ...(inactiveNames.length > 0 ? [`Inactive employee has time in this period: ${inactiveNames.join(', ')}`] : []),
    ],
    acceptableExclusions: [
      ...(openWorkCount > 0 ? [`${openWorkCount} open work ${openWorkCount === 1 ? 'entry is' : 'entries are'} excluded from payroll summary/location exports by design`] : []),
      ...(openBreakCount > 0 ? [`${openBreakCount} open break ${openBreakCount === 1 ? 'entry is' : 'entries are'} excluded from payroll summary/location exports by design`] : []),
    ],
  };
}

function uniqueNames(profiles: Profile[]) {
  return [...new Set(profiles.map((profile) => `${profile.firstName} ${profile.lastName}`))].sort();
}
