import type { JobCode, JobSite, PayPeriodSettings, Profile, TimeEntry } from '../../domain/types';

export const employeeProfile: Profile = {
  id: 'employee-1',
  email: 'employee@example.com',
  firstName: 'Emmanuel',
  lastName: 'Ero',
  role: 'employee',
  workerType: 'employee',
  contractorHstApplicable: false,
  hourlyRate: 18,
  paidBreaks: false,
  paidBreakMinutes: 30,
  canAccessScopes: true,
  isActive: true,
  createdAt: '2026-01-01T12:00:00.000Z',
};

export const paidBreakProfile: Profile = {
  ...employeeProfile,
  id: 'paid-break-employee',
  email: 'paid-break@example.com',
  paidBreaks: true,
};

export const jobSites: JobSite[] = [
  {
    id: 'site-358',
    name: '356-358 Queen St',
    address: null,
    latitude: null,
    longitude: null,
    geofenceRadiusMeters: 250,
    isActive: true,
    isArchived: false,
    createdAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'site-other',
    name: 'Other Property',
    address: null,
    latitude: null,
    longitude: null,
    geofenceRadiusMeters: 250,
    isActive: true,
    isArchived: false,
    createdAt: '2026-01-01T12:00:00.000Z',
  },
];

export const jobCodes: JobCode[] = [
  {
    id: 'job-qa0358',
    jobSiteId: 'site-358',
    code: 'QA0358',
    name: 'QA',
    isActive: true,
    isArchived: false,
    createdAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'job-qs0358',
    jobSiteId: 'site-358',
    code: 'QS0358',
    name: 'QS',
    isActive: true,
    isArchived: false,
    createdAt: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'job-other',
    jobSiteId: 'site-other',
    code: 'EX0814',
    name: 'Other',
    isActive: true,
    isArchived: false,
    createdAt: '2026-01-01T12:00:00.000Z',
  },
];

export const payPeriodSettings: PayPeriodSettings = {
  anchorStart: '2026-06-01',
  lengthDays: 14,
  weeklyOvertimeThresholdHours: 48,
  laborCostMultiplier: 1.25,
};

let entrySequence = 0;

export function resetEntrySequence() {
  entrySequence = 0;
}

export function workEntry(params: {
  userId?: string;
  jobCodeId?: string | null;
  clockIn: string;
  hours: number;
  id?: string;
  clockOut?: string | null;
}): TimeEntry {
  return entry({
    id: params.id,
    userId: params.userId,
    jobCodeId: params.jobCodeId ?? 'job-qa0358',
    eventType: 'work',
    clockIn: params.clockIn,
    clockOut: params.clockOut === undefined ? addHours(params.clockIn, params.hours) : params.clockOut,
    notes: '',
  });
}

export function breakEntry(params: {
  userId?: string;
  clockIn: string;
  hours: number;
  id?: string;
  clockOut?: string | null;
}): TimeEntry {
  return entry({
    id: params.id,
    userId: params.userId,
    jobCodeId: null,
    eventType: 'break',
    clockIn: params.clockIn,
    clockOut: params.clockOut === undefined ? addHours(params.clockIn, params.hours) : params.clockOut,
    notes: 'Break',
  });
}

export function addHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function entry(params: {
  id?: string;
  userId?: string;
  jobCodeId: string | null;
  eventType: 'work' | 'break';
  clockIn: string;
  clockOut?: string | null;
  notes?: string;
}): TimeEntry {
  const id = params.id ?? `entry-${entrySequence += 1}`;
  return {
    id,
    userId: params.userId ?? employeeProfile.id,
    jobCodeId: params.jobCodeId,
    eventType: params.eventType,
    clockIn: params.clockIn,
    clockOut: params.clockOut ?? null,
    clockInLat: null,
    clockInLng: null,
    clockOutLat: null,
    clockOutLng: null,
    notes: params.notes ?? '',
    isAutoClockedOut: false,
    createdBy: params.userId ?? employeeProfile.id,
    createdAt: params.clockIn,
  };
}
