import type { AppRole, AuditLog, GpsPoint, JobCode, JobSite, PayPeriodSettings, PayrollGrossUpMultiplier, Profile, ScopeBuilderData, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection, TimeEntry, TimesheetApproval } from '../domain/types';
import { defaultPayPeriodSettings, getPayPeriodForDate, normalizePayPeriodSettings } from '../hooks/usePayPeriodSettings';
import { getAtlanticDateKey } from '../utils/time';
import type { AdminTimeClockService, PasskeyInfo } from './TimeClockService';

const now = new Date();
const iso = (date: Date) => date.toISOString();
const hoursAgo = (hours: number) => iso(new Date(now.getTime() - hours * 60 * 60 * 1000));
const daysAgoAt = (days: number, hour: number, minute = 0) => {
  const date = new Date(now);
  date.setDate(now.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return iso(date);
};

let profiles: Profile[] = [
  {
    id: 'profile-employee-1',
    email: 'employee@example.com',
    firstName: 'Jamie',
    lastName: 'Carpenter',
    role: 'employee',
    workerType: 'employee',
    contractorHstApplicable: false,
    hourlyRate: 24,
    paidBreaks: false,
    paidBreakMinutes: 30,
    canAccessScopes: true,
    isActive: true,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'profile-admin-1',
    email: 'dane@example.com',
    firstName: 'Dane',
    lastName: 'Cutcliffe',
    role: 'admin',
    workerType: 'employee',
    contractorHstApplicable: false,
    hourlyRate: 0,
    paidBreaks: false,
    paidBreakMinutes: 30,
    canAccessScopes: true,
    isActive: true,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'profile-employee-2',
    email: 'morgan@example.com',
    firstName: 'Morgan',
    lastName: 'Painter',
    role: 'employee',
    workerType: 'employee',
    contractorHstApplicable: false,
    hourlyRate: 22.5,
    paidBreaks: true,
    paidBreakMinutes: 30,
    canAccessScopes: true,
    isActive: true,
    createdAt: iso(new Date('2026-01-02T12:00:00Z')),
  },
];

let jobSites: JobSite[] = [
  {
    id: 'site-orlebar',
    name: '8-14 Orlebar',
    address: '8 Orlebar Street, Charlottetown, PE',
    latitude: 46.2382,
    longitude: -63.1311,
    geofenceRadiusMeters: 250,
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'site-cumberland',
    name: '1-154 Cumberland',
    address: '154 Cumberland Street, Charlottetown, PE',
    latitude: 46.2315,
    longitude: -63.1272,
    geofenceRadiusMeters: 250,
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'site-newland',
    name: '74 Newland',
    address: '74 Newland Crescent, Charlottetown, PE',
    latitude: 46.255,
    longitude: -63.123,
    geofenceRadiusMeters: 250,
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
];

let jobCodes: JobCode[] = [
  {
    id: 'job-orlebar',
    jobSiteId: 'site-orlebar',
    code: 'IN0001',
    name: 'Interior renovation',
    description: 'Interior renovation and unit turnover work',
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'job-cumberland',
    jobSiteId: 'site-cumberland',
    code: 'CO0001',
    name: 'Condo renovation',
    description: 'Condo renovation tasks',
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
  {
    id: 'job-newland',
    jobSiteId: 'site-newland',
    code: 'MA0001',
    name: 'Maintenance',
    description: 'Duplex maintenance',
    isActive: true,
    isArchived: false,
    createdAt: iso(new Date('2026-01-01T12:00:00Z')),
  },
];

let currentProfileId = 'profile-employee-1';
let auditLogs: AuditLog[] = [
  {
    id: 'audit-seed-1',
    userId: 'profile-admin-1',
    action: 'update',
    targetTable: 'time_entries',
    targetId: 'entry-6',
    oldValues: { clock_out_lat: 46.2315, notes: 'Paint prep.' },
    newValues: { clock_out_lat: null, notes: 'Paint prep. Clock-out GPS unavailable.' },
    createdAt: hoursAgo(18),
  },
];

let timesheetApprovals: TimesheetApproval[] = [];
let payPeriodSettings: PayPeriodSettings = defaultPayPeriodSettings();
let payrollGrossUpMultipliers: PayrollGrossUpMultiplier[] = [
  {
    id: 'gross-up-baseline',
    effectiveDate: payPeriodSettings.anchorStart,
    multiplier: payPeriodSettings.laborCostMultiplier ?? 1.25,
    createdAt: new Date().toISOString(),
  },
];
let mockPasskeys: PasskeyInfo[] = [];
let scopeBuilderProjects: ScopeBuilderProject[] = [
  {
    id: 'scope-builder-orlebar',
    jobSiteId: 'site-orlebar',
    jobCodeId: 'job-orlebar',
    title: 'Interior renovation beta',
    notes: 'Beta builder sandbox',
    status: 'draft',
    isActive: true,
    createdAt: iso(new Date('2026-05-29T12:00:00Z')),
    updatedAt: iso(new Date('2026-05-29T12:00:00Z')),
  },
];
let scopeBuilderSections: ScopeBuilderSection[] = [
  {
    id: 'scope-builder-section-all-rooms',
    projectId: 'scope-builder-orlebar',
    title: 'All Rooms',
    sortOrder: 10,
    isActive: true,
    createdAt: iso(new Date('2026-05-29T12:00:00Z')),
    updatedAt: iso(new Date('2026-05-29T12:00:00Z')),
  },
  {
    id: 'scope-builder-section-kitchen',
    projectId: 'scope-builder-orlebar',
    title: 'Kitchen',
    sortOrder: 20,
    isActive: true,
    createdAt: iso(new Date('2026-05-29T12:00:00Z')),
    updatedAt: iso(new Date('2026-05-29T12:00:00Z')),
  },
];
let scopeBuilderItems: ScopeBuilderItem[] = [
  {
    id: 'scope-builder-item-demo-1',
    projectId: 'scope-builder-orlebar',
    sectionId: 'scope-builder-section-all-rooms',
    itemText: 'Prep walls, ceilings, trims, doors and closets for paint.',
    sortOrder: 10,
    isComplete: false,
    isActive: true,
    createdAt: iso(new Date('2026-05-29T12:00:00Z')),
    updatedAt: iso(new Date('2026-05-29T12:00:00Z')),
  },
  {
    id: 'scope-builder-item-demo-2',
    projectId: 'scope-builder-orlebar',
    sectionId: 'scope-builder-section-kitchen',
    itemText: 'Install new kitchen cabinets after flooring is installed.',
    sortOrder: 10,
    isComplete: false,
    isActive: true,
    createdAt: iso(new Date('2026-05-29T12:00:00Z')),
    updatedAt: iso(new Date('2026-05-29T12:00:00Z')),
  },
];

let timeEntries: TimeEntry[] = [
  {
    id: 'entry-1',
    userId: 'profile-employee-1',
    jobCodeId: 'job-orlebar',
    eventType: 'work',
    clockIn: daysAgoAt(1, 8, 15),
    clockOut: daysAgoAt(1, 16, 30),
    clockInLat: 46.2382,
    clockInLng: -63.1311,
    clockOutLat: 46.2382,
    clockOutLng: -63.1311,
    notes: 'Framing cleanup and cabinet layout.',
    isAutoClockedOut: false,
    createdBy: 'profile-employee-1',
    createdAt: daysAgoAt(1, 8, 15),
  },
  {
    id: 'entry-2',
    userId: 'profile-employee-1',
    jobCodeId: 'job-orlebar',
    eventType: 'break',
    clockIn: daysAgoAt(1, 12, 10),
    clockOut: daysAgoAt(1, 12, 40),
    clockInLat: 46.2382,
    clockInLng: -63.1311,
    clockOutLat: 46.2382,
    clockOutLng: -63.1311,
    notes: 'Lunch',
    isAutoClockedOut: false,
    createdBy: 'profile-employee-1',
    createdAt: daysAgoAt(1, 12, 10),
  },
  {
    id: 'entry-3',
    userId: 'profile-employee-1',
    jobCodeId: 'job-cumberland',
    eventType: 'work',
    clockIn: daysAgoAt(2, 9, 0),
    clockOut: daysAgoAt(2, 14, 45),
    clockInLat: null,
    clockInLng: null,
    clockOutLat: 46.2315,
    clockOutLng: -63.1272,
    notes: 'Drywall touch-ups. Clock-in GPS unavailable.',
    isAutoClockedOut: false,
    createdBy: 'profile-employee-1',
    createdAt: daysAgoAt(2, 9, 0),
  },
  {
    id: 'entry-4',
    userId: 'profile-employee-1',
    jobCodeId: 'job-newland',
    eventType: 'work',
    clockIn: hoursAgo(3.5),
    clockOut: hoursAgo(1.5),
    clockInLat: 46.255,
    clockInLng: -63.123,
    clockOutLat: 46.255,
    clockOutLng: -63.123,
    notes: 'Morning maintenance check.',
    isAutoClockedOut: false,
    createdBy: 'profile-employee-1',
    createdAt: hoursAgo(3.5),
  },
  {
    id: 'entry-5',
    userId: 'profile-employee-2',
    jobCodeId: 'job-orlebar',
    eventType: 'work',
    clockIn: daysAgoAt(0, 7, 45),
    clockOut: daysAgoAt(0, 13, 15),
    clockInLat: 46.2382,
    clockInLng: -63.1311,
    clockOutLat: 46.2382,
    clockOutLng: -63.1311,
    notes: 'Priming and first coat.',
    isAutoClockedOut: false,
    createdBy: 'profile-employee-2',
    createdAt: daysAgoAt(0, 7, 45),
  },
  {
    id: 'entry-6',
    userId: 'profile-employee-2',
    jobCodeId: 'job-cumberland',
    eventType: 'work',
    clockIn: daysAgoAt(1, 9, 30),
    clockOut: daysAgoAt(1, 15, 0),
    clockInLat: 46.2315,
    clockInLng: -63.1272,
    clockOutLat: null,
    clockOutLng: null,
    notes: 'Paint prep. Clock-out GPS unavailable.',
    isAutoClockedOut: false,
    createdBy: 'profile-admin-1',
    editedBy: 'profile-admin-1',
    editedAt: hoursAgo(18),
    createdAt: daysAgoAt(1, 9, 30),
  },
];

if (import.meta.env.VITE_TIME_CLOCK_STRESS_DATA === 'true') {
  profiles = [
    ...profiles,
    {
      id: 'profile-stress-long',
      email: 'alexandria.cascading-long-name@example.com',
      firstName: 'Alexandria-Cassandra',
      lastName: 'Van Der Extremely Long Renovation Notes',
      role: 'employee',
      workerType: 'employee',
      contractorHstApplicable: false,
      hourlyRate: 33.33,
      paidBreaks: true,
      paidBreakMinutes: 30,
      canAccessScopes: true,
      isActive: true,
      createdAt: iso(new Date('2026-01-03T12:00:00Z')),
    },
    {
      id: 'profile-stress-empty',
      email: 'empty.state.long-name@example.com',
      firstName: 'No-Entries-Yet',
      lastName: 'Stress Fixture With A Very Long Surname',
      role: 'employee',
      workerType: 'contractor',
      contractorHstApplicable: true,
      hourlyRate: 41.25,
      paidBreaks: false,
      paidBreakMinutes: 30,
      canAccessScopes: false,
      isActive: true,
      createdAt: iso(new Date('2026-01-04T12:00:00Z')),
    },
  ];
  jobSites = [
    ...jobSites,
    {
      id: 'site-stress-long',
      name: 'Stress Property With An Unreasonably Long Name For Mobile Cards And Reports',
      address: '123 Extremely Long Renovation Site Address, Charlottetown, PE',
      latitude: 46.2401,
      longitude: -63.1301,
      geofenceRadiusMeters: 250,
      isActive: true,
      isArchived: false,
      createdAt: iso(new Date('2026-01-03T12:00:00Z')),
    },
  ];
  jobCodes = [
    ...jobCodes,
    {
      id: 'job-stress-long',
      jobSiteId: 'site-stress-long',
      code: 'STRESS-LONG-JOB-CODE-0001',
      name: 'Long job code label for report dropdown wrapping and table containment',
      description: 'Stress job used only by Playwright smoke tests.',
      isActive: true,
      isArchived: false,
      createdAt: iso(new Date('2026-01-03T12:00:00Z')),
    },
  ];
  timeEntries = [
    ...timeEntries,
    {
      id: 'entry-stress-long-closed',
      userId: 'profile-stress-long',
      jobCodeId: 'job-stress-long',
      eventType: 'work',
      clockIn: daysAgoAt(0, 8, 5),
      clockOut: daysAgoAt(0, 15, 42),
      clockInLat: 46.2401,
      clockInLng: -63.1301,
      clockOutLat: null,
      clockOutLng: null,
      notes: 'Stress note with lots of details: cabinet delivery delayed, hallway staging crowded, tenant access window changed, and this sentence intentionally keeps going so report rows and cards must wrap safely instead of widening the mobile shell.',
      isAutoClockedOut: false,
      createdBy: 'profile-stress-long',
      createdAt: daysAgoAt(0, 8, 5),
    },
    {
      id: 'entry-stress-long-break',
      userId: 'profile-stress-long',
      jobCodeId: null,
      eventType: 'break',
      clockIn: daysAgoAt(0, 12, 10),
      clockOut: daysAgoAt(0, 12, 45),
      clockInLat: 46.2401,
      clockInLng: -63.1301,
      clockOutLat: null,
      clockOutLng: null,
      notes: 'Stress break entry',
      isAutoClockedOut: false,
      createdBy: 'profile-stress-long',
      createdAt: daysAgoAt(0, 12, 10),
    },
    {
      id: 'entry-stress-long-open',
      userId: 'profile-stress-long',
      jobCodeId: 'job-stress-long',
      eventType: 'work',
      clockIn: hoursAgo(2),
      clockOut: null,
      clockInLat: 46.2401,
      clockInLng: -63.1301,
      clockOutLat: null,
      clockOutLng: null,
      notes: 'Open stress entry to prove dashboard and export readiness keep open rows visible without counting them as final payroll.',
      isAutoClockedOut: false,
      createdBy: 'profile-stress-long',
      createdAt: hoursAgo(2),
    },
  ];
}

const delay = async () => {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
};

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const cloneEntry = (entry: TimeEntry): TimeEntry => ({ ...entry });
const cloneScopeBuilderData = (projectId: string): ScopeBuilderData => {
  const project = scopeBuilderProjects.find((candidate) => candidate.id === projectId && candidate.isActive);
  if (!project) throw new Error('Beta scope not found.');
  return {
    project: { ...project },
    sections: scopeBuilderSections
      .filter((section) => section.projectId === projectId && section.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({ ...section })),
    items: scopeBuilderItems
      .filter((item) => item.projectId === projectId && item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({ ...item })),
  };
};

const findEntry = (entryId: string) => {
  const entry = timeEntries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error('Time entry not found.');
  return entry;
};

const applyClockOutGps = (entry: TimeEntry, gps?: GpsPoint | null) => {
  entry.clockOutLat = gps?.status === 'captured' ? gps.lat : null;
  entry.clockOutLng = gps?.status === 'captured' ? gps.lng : null;
};

const logAudit = (params: Omit<AuditLog, 'id' | 'createdAt'>) => {
  auditLogs = [{ id: makeId('audit'), createdAt: new Date().toISOString(), ...params }, ...auditLogs];
};

const isApprovedTimeEntry = (entry: TimeEntry) => {
  return timeEntryTouchesApprovedPeriod(entry.userId, entry.clockIn, entry.clockOut);
};

const timeEntryTouchesApprovedPeriod = (userId: string, clockIn: string, clockOut?: string | null) => {
  const entryStart = getAtlanticDateKey(clockIn);
  const entryEnd = getAtlanticDateKey(clockOut ?? clockIn);
  return timesheetApprovals.some((approval) => (
    approval.userId === userId
    && approval.status === 'approved'
    && entryStart <= approval.weekEnd
    && entryEnd >= approval.weekStart
  ));
};

const assertTimeEntryUnlocked = (userId: string, clockIn: string, clockOut?: string | null, action = 'editing') => {
  if (!timeEntryTouchesApprovedPeriod(userId, clockIn, clockOut)) return;
  throw new Error(`This week has been approved. Unlock it before ${action} entries.`);
};

const hasClosedWorkOverlap = ({
  id,
  userId,
  eventType,
  clockIn,
  clockOut,
}: Pick<TimeEntry, 'id' | 'userId' | 'eventType' | 'clockIn' | 'clockOut'>) => {
  if (eventType !== 'work' || !clockOut) return false;
  const candidateStart = new Date(clockIn).getTime();
  const candidateEnd = new Date(clockOut).getTime();
  return timeEntries.some((entry) => {
    if (entry.id === id || entry.userId !== userId || entry.eventType !== 'work') return false;
    const existingStart = new Date(entry.clockIn).getTime();
    const existingEnd = entry.clockOut ? new Date(entry.clockOut).getTime() : Number.POSITIVE_INFINITY;
    return candidateStart < existingEnd && existingStart < candidateEnd;
  });
};

const assertNoClosedWorkOverlap = (entry: Pick<TimeEntry, 'id' | 'userId' | 'eventType' | 'clockIn' | 'clockOut'>) => {
  if (hasClosedWorkOverlap(entry)) {
    throw new Error('This work entry overlaps another closed work entry for the same employee.');
  }
};

const workEntryContainsBreakStart = (
  entry: Pick<TimeEntry, 'userId' | 'eventType' | 'clockIn' | 'clockOut'>,
  userId: string,
  breakStart: number,
) => {
  if (entry.userId !== userId || entry.eventType !== 'work') return false;
  const workStart = new Date(entry.clockIn).getTime();
  const workEnd = entry.clockOut ? new Date(entry.clockOut).getTime() : Number.POSITIVE_INFINITY;
  return breakStart >= workStart && breakStart < workEnd;
};

const hasWorkEntryForBreakStart = (
  userId: string,
  clockIn: string,
  options: {
    excludedWorkEntryId?: string;
    replacementWorkEntry?: Pick<TimeEntry, 'userId' | 'eventType' | 'clockIn' | 'clockOut'>;
  } = {},
) => {
  const breakStart = new Date(clockIn).getTime();
  return timeEntries.some((entry) => (
    entry.id !== options.excludedWorkEntryId && workEntryContainsBreakStart(entry, userId, breakStart)
  )) || Boolean(options.replacementWorkEntry && workEntryContainsBreakStart(options.replacementWorkEntry, userId, breakStart));
};

const assertManualBreakHasWorkEntry = (userId: string, clockIn: string) => {
  if (!hasWorkEntryForBreakStart(userId, clockIn)) {
    throw new Error('Manual break entries must start within an existing work entry for the employee.');
  }
};

const assertWorkChangePreservesBreaks = (
  existing: TimeEntry,
  replacement?: Pick<TimeEntry, 'userId' | 'eventType' | 'clockIn' | 'clockOut'>,
) => {
  if (existing.eventType !== 'work') return;
  const orphanedBreak = timeEntries.find((entry) => (
    entry.eventType === 'break'
    && workEntryContainsBreakStart(existing, entry.userId, new Date(entry.clockIn).getTime())
    && !hasWorkEntryForBreakStart(entry.userId, entry.clockIn, {
      excludedWorkEntryId: existing.id,
      replacementWorkEntry: replacement?.eventType === 'work' ? replacement : undefined,
    })
  ));
  if (orphanedBreak) {
    throw new Error('Work entry changes cannot leave existing break entries without a containing work entry.');
  }
};

const assertCanPunchFor = (userId: string) => {
  const profile = profiles.find((candidate) => candidate.id === currentProfileId);
  if (!profile?.isActive) throw new Error('This account is inactive. Ask an admin to reactivate it.');
  if (profile.id !== userId) throw new Error('Employee punch actions can only be saved for the signed-in user. Use admin manual entries for corrections.');
};

const assertSelectableJobCode = (jobCodeId: string) => {
  const job = jobCodes.find((candidate) => candidate.id === jobCodeId);
  if (!job?.isActive || job.isArchived) throw new Error('Choose an active job code.');
};

export const mockGpsPoint = (): GpsPoint => ({
  lat: 46.2382,
  lng: -63.1311,
  status: 'captured',
});

export const mockTimeClockService: AdminTimeClockService = {
  mode: 'mock',

  async getCurrentProfile() {
    await delay();
    return profiles.find((profile) => profile.id === currentProfileId) ?? null;
  },

  async setMockRole(role: AppRole) {
    await delay();
    currentProfileId = role === 'admin' ? 'profile-admin-1' : 'profile-employee-1';
  },

  async signInWithPasskey() {
    await delay();
    currentProfileId = 'profile-employee-1';
  },

  async resetPassword() {
    await delay();
  },

  async updatePassword() {
    await delay();
  },

  async getPasskeySupport() {
    await delay();
    return { isSupported: true, label: 'Use Face ID or Touch ID' };
  },

  async registerPasskey({ friendlyName } = {}) {
    await delay();
    const passkey = {
      id: makeId('passkey'),
      friendlyName: friendlyName ?? 'Mock device biometrics',
      createdAt: new Date().toISOString(),
    };
    mockPasskeys = [passkey];
    return passkey;
  },

  async listPasskeys() {
    await delay();
    return mockPasskeys.map((passkey) => ({ ...passkey }));
  },

  async deletePasskey({ passkeyId }) {
    await delay();
    mockPasskeys = mockPasskeys.filter((passkey) => passkey.id !== passkeyId);
  },

  async getPayPeriodSettings() {
    await delay();
    return { ...payPeriodSettings };
  },

  async listProfiles() {
    await delay();
    return profiles.map((profile) => ({ ...profile }));
  },

  async listJobSites() {
    await delay();
    const isAdmin = currentProfileId === 'profile-admin-1';
    return jobSites.filter((site) => isAdmin || (site.isActive && !site.isArchived)).map((site) => ({ ...site }));
  },

  async listJobCodes() {
    await delay();
    const isAdmin = currentProfileId === 'profile-admin-1';
    return jobCodes.filter((job) => isAdmin || (job.isActive && !job.isArchived)).map((job) => ({ ...job }));
  },

  async listTimeEntries(params) {
    await delay();
    return timeEntries
      .filter((entry) => {
        if (params.userId && entry.userId !== params.userId) return false;
        if (params.jobCodeId && entry.jobCodeId !== params.jobCodeId) return false;
        if (params.start && entry.clockIn < params.start) return false;
        if (params.end && entry.clockIn > params.end) return false;
        return true;
      })
      .sort((a, b) => b.clockIn.localeCompare(a.clockIn))
      .map(cloneEntry);
  },

  async listTimesheetApprovals(params = {}) {
    await delay();
    return timesheetApprovals
      .filter((approval) => {
        if (params.userId && approval.userId !== params.userId) return false;
        if (params.weekStart && approval.weekStart !== params.weekStart) return false;
        return true;
      })
      .map((approval) => ({ ...approval }));
  },

  async getOpenWorkEntry(userId) {
    await delay();
    const entry = timeEntries.find((candidate) => candidate.userId === userId && candidate.eventType === 'work' && !candidate.clockOut);
    return entry ? cloneEntry(entry) : null;
  },

  async getOpenBreakEntry(userId) {
    await delay();
    const entry = timeEntries.find((candidate) => candidate.userId === userId && candidate.eventType === 'break' && !candidate.clockOut);
    return entry ? cloneEntry(entry) : null;
  },

  async clockIn({ userId, jobCodeId, at, gps }) {
    await delay();
    assertCanPunchFor(userId);
    assertSelectableJobCode(jobCodeId);
    assertTimeEntryUnlocked(userId, at, null, 'adding time');
    if (timeEntries.some((entry) => entry.userId === userId && entry.eventType === 'work' && !entry.clockOut)) {
      throw new Error('You are already clocked in.');
    }
    if (timeEntries.some((entry) => entry.userId === userId && entry.eventType === 'break' && !entry.clockOut)) {
      throw new Error('End your break before clocking in.');
    }
    const entry: TimeEntry = {
      id: makeId('entry'),
      userId,
      jobCodeId,
      eventType: 'work',
      clockIn: at,
      clockOut: null,
      clockInLat: gps?.status === 'captured' ? gps.lat : null,
      clockInLng: gps?.status === 'captured' ? gps.lng : null,
      clockOutLat: null,
      clockOutLng: null,
      notes: '',
      isAutoClockedOut: false,
      createdBy: userId,
      createdAt: at,
    };
    timeEntries = [...timeEntries, entry];
    return cloneEntry(entry);
  },

  async clockOut({ entryId, at, gps, notes }) {
    await delay();
    const entry = findEntry(entryId);
    if (entry.clockOut) throw new Error('This entry is already clocked out.');
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, entry.clockOut, 'editing');
    if (timeEntries.some((candidate) => candidate.userId === entry.userId && candidate.eventType === 'break' && !candidate.clockOut)) {
      throw new Error('End your break before clocking out.');
    }
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, at, 'editing');
    assertNoClosedWorkOverlap({ ...entry, clockOut: at });
    if (notes !== undefined) entry.notes = notes.trim();
    entry.clockOut = at;
    applyClockOutGps(entry, gps);
    return cloneEntry(entry);
  },

  async startBreak({ userId, at, gps }) {
    await delay();
    assertCanPunchFor(userId);
    assertTimeEntryUnlocked(userId, at, null, 'adding time');
    if (timeEntries.some((entry) => entry.userId === userId && entry.eventType === 'break' && !entry.clockOut)) {
      throw new Error('A break is already in progress.');
    }
    if (!timeEntries.some((entry) => entry.userId === userId && entry.eventType === 'work' && !entry.clockOut)) {
      throw new Error('You must be clocked in before starting a break.');
    }
    const entry: TimeEntry = {
      id: makeId('break'),
      userId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: at,
      clockOut: null,
      clockInLat: gps?.status === 'captured' ? gps.lat : null,
      clockInLng: gps?.status === 'captured' ? gps.lng : null,
      clockOutLat: null,
      clockOutLng: null,
      notes: 'Break',
      isAutoClockedOut: false,
      createdBy: userId,
      createdAt: at,
    };
    timeEntries = [...timeEntries, entry];
    return cloneEntry(entry);
  },

  async endBreak({ entryId, at, gps }) {
    await delay();
    const entry = findEntry(entryId);
    if (entry.eventType !== 'break') throw new Error('Only break entries can be ended here.');
    if (entry.clockOut) throw new Error('This break is already ended.');
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, entry.clockOut, 'editing');
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, at, 'editing');
    entry.clockOut = at;
    applyClockOutGps(entry, gps);
    return cloneEntry(entry);
  },

  async switchJob({ userId, fromEntryId, toJobCodeId, at, gps }) {
    await delay();
    assertCanPunchFor(userId);
    assertSelectableJobCode(toJobCodeId);
    if (timeEntries.some((entry) => entry.userId === userId && entry.eventType === 'break' && !entry.clockOut)) {
      throw new Error('End your break before switching jobs.');
    }
    const fromEntry = findEntry(fromEntryId);
    if (fromEntry.userId !== userId || fromEntry.eventType !== 'work' || fromEntry.clockOut) {
      throw new Error('No active work entry to switch from.');
    }
    assertTimeEntryUnlocked(fromEntry.userId, fromEntry.clockIn, fromEntry.clockOut, 'editing');
    assertTimeEntryUnlocked(fromEntry.userId, fromEntry.clockIn, at, 'editing');
    assertTimeEntryUnlocked(userId, at, null, 'adding time');
    assertNoClosedWorkOverlap({ ...fromEntry, clockOut: at });
    fromEntry.clockOut = at;
    applyClockOutGps(fromEntry, gps);
    const openedEntry: TimeEntry = {
      id: makeId('entry'),
      userId,
      jobCodeId: toJobCodeId,
      eventType: 'work',
      clockIn: at,
      clockOut: null,
      clockInLat: gps?.status === 'captured' ? gps.lat : null,
      clockInLng: gps?.status === 'captured' ? gps.lng : null,
      clockOutLat: null,
      clockOutLng: null,
      notes: '',
      isAutoClockedOut: false,
      createdBy: userId,
      createdAt: at,
    };
    timeEntries = [...timeEntries, openedEntry];
    return { closedEntry: cloneEntry(fromEntry), openedEntry: cloneEntry(openedEntry) };
  },

  async updateEntryNotes({ entryId, notes }) {
    await delay();
    const entry = findEntry(entryId);
    if (isApprovedTimeEntry(entry)) throw new Error('This week has been approved. Ask an admin to unlock it before editing.');
    entry.notes = notes;
    return cloneEntry(entry);
  },

  async createManualEntry({ userId, jobCodeId, eventType = 'work', clockIn, clockOut, notes, createdBy }) {
    await delay();
    if (eventType === 'work' && !jobCodeId) throw new Error('Manual work entries need a job code.');
    if (eventType === 'break' && !clockOut) throw new Error('Manual break entries need a punch out time.');
    if (clockOut && new Date(clockOut).getTime() <= new Date(clockIn).getTime()) throw new Error('Clock out must be after clock in.');
    if (eventType === 'break') assertManualBreakHasWorkEntry(userId, clockIn);
    assertTimeEntryUnlocked(userId, clockIn, clockOut, 'adding time');
    const entry: TimeEntry = {
      id: makeId('manual'),
      userId,
      jobCodeId: eventType === 'break' ? null : jobCodeId,
      eventType,
      clockIn,
      clockOut: clockOut || null,
      clockInLat: null,
      clockInLng: null,
      clockOutLat: null,
      clockOutLng: null,
      notes: notes || (eventType === 'break' ? 'Break' : ''),
      isAutoClockedOut: false,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    assertNoClosedWorkOverlap(entry);
    timeEntries = [...timeEntries, entry];
    logAudit({ userId: createdBy, action: 'manual_entry_created', targetTable: 'time_entries', targetId: entry.id, oldValues: null, newValues: { ...entry } });
    return cloneEntry(entry);
  },

  async updateTimeEntry({ entryId, patch, editedBy }) {
    await delay();
    const entry = findEntry(entryId);
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, entry.clockOut, 'editing');
    const oldValues = cloneEntry(entry);
    const candidate = { ...entry };
    if (patch.clockIn) candidate.clockIn = patch.clockIn;
    if (patch.clockOut !== undefined) candidate.clockOut = patch.clockOut;
    if (patch.jobCodeId !== undefined) candidate.jobCodeId = patch.jobCodeId;
    if (patch.notes !== undefined) candidate.notes = patch.notes;
    if (candidate.clockOut && new Date(candidate.clockOut).getTime() <= new Date(candidate.clockIn).getTime()) {
      throw new Error('Clock out must be after clock in.');
    }
    if (candidate.eventType === 'break') {
      assertManualBreakHasWorkEntry(candidate.userId, candidate.clockIn);
    }
    assertWorkChangePreservesBreaks(entry, candidate);
    assertTimeEntryUnlocked(candidate.userId, candidate.clockIn, candidate.clockOut, 'editing');
    assertNoClosedWorkOverlap(candidate);
    Object.assign(entry, candidate);
    entry.editedBy = editedBy;
    entry.editedAt = new Date().toISOString();
    logAudit({ userId: editedBy, action: 'time_entry_edited', targetTable: 'time_entries', targetId: entry.id, oldValues: { ...oldValues }, newValues: { ...cloneEntry(entry) } });
    return cloneEntry(entry);
  },

  async deleteTimeEntry({ entryId }) {
    await delay();
    const idx = timeEntries.findIndex((e: TimeEntry) => e.id === entryId);
    if (idx === -1) throw new Error('Time entry not found.');
    const entry = timeEntries[idx];
    assertTimeEntryUnlocked(entry.userId, entry.clockIn, entry.clockOut, 'deleting');
    assertWorkChangePreservesBreaks(entry);
    logAudit({ userId: currentProfileId, action: 'time_entry_deleted', targetTable: 'time_entries', targetId: entry.id, oldValues: { ...cloneEntry(entry) }, newValues: null });
    timeEntries.splice(idx, 1);
  },

  async updateProfile({ profileId, patch }) {
    await delay();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    const oldValues = { ...profile };
    Object.assign(profile, patch);
    logAudit({ userId: currentProfileId, action: 'profile_updated', targetTable: 'profiles', targetId: profile.id, oldValues, newValues: { ...profile } });
    return { ...profile };
  },

  async deleteProfile({ profileId }) {
    await delay();
    if (profileId === currentProfileId) throw new Error('You cannot delete the currently signed-in profile.');
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    if (timeEntries.some((entry) => entry.userId === profileId)) {
      throw new Error('Employees with time entries cannot be deleted from the mock payroll history.');
    }
    profiles = profiles.filter((candidate) => candidate.id !== profileId);
    logAudit({ userId: currentProfileId, action: 'profile_deleted', targetTable: 'profiles', targetId: profile.id, oldValues: { ...profile }, newValues: null });
  },

  async rejectSignup({ profileId }) {
    await delay();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('Signup request not found.');
    if (!profile.signupPending || profile.isActive || timeEntries.some((entry) => entry.userId === profileId)) throw new Error('Only pending signup requests with no time history can be rejected.');
    profiles = profiles.filter((candidate) => candidate.id !== profileId);
    logAudit({ userId: currentProfileId, action: 'signup_rejected', targetTable: 'profiles', targetId: profile.id, oldValues: { ...profile }, newValues: null });
  },

  async createProfile({ email, firstName, lastName, role, workerType, contractorHstApplicable, hourlyRate, paidBreaks, paidBreakMinutes, canAccessScopes, isActive }) {
    await delay();
    if (!email.trim()) throw new Error('Email is required.');
    if (!firstName.trim() || !lastName.trim()) throw new Error('First and last name are required.');
    if (profiles.some((profile) => profile.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An employee with this email already exists.');
    }
    const profile: Profile = {
      id: makeId('profile'),
      email,
      firstName,
      lastName,
      role,
      workerType,
      contractorHstApplicable,
      hourlyRate,
      paidBreaks,
      paidBreakMinutes,
      canAccessScopes,
      isActive,
      signupPending: false,
      createdAt: new Date().toISOString(),
    };
    profiles = [...profiles, profile];
    logAudit({ userId: currentProfileId, action: 'profile_created', targetTable: 'profiles', targetId: profile.id, oldValues: null, newValues: { ...profile } });
    return { ...profile };
  },

  async createJobCode({ jobSiteId, code, name, description }) {
    await delay();
    if (!name.trim()) throw new Error('Job title is required.');
    const jobCode = code?.trim() ? normalizeJobCode(code) : generateMockJobCode(name);
    if (!/^[A-Z]{2}\d{4}$/.test(jobCode)) throw new Error('Job code must use two letters followed by four digits.');
    if (jobCodes.some((job) => job.code === jobCode)) throw new Error('That job code is already in use.');
    const job: JobCode = { id: makeId('job'), jobSiteId: jobSiteId ?? null, code: jobCode, name, description, isActive: true, isArchived: false, createdAt: new Date().toISOString() };
    jobCodes = [...jobCodes, job];
    logAudit({ userId: currentProfileId, action: 'job_code_created', targetTable: 'job_codes', targetId: job.id, oldValues: null, newValues: { ...job } });
    return { ...job };
  },

  async createJobSite({ name, address, latitude, longitude, geofenceRadiusMeters = 250 }) {
    await delay();
    if (!name.trim()) throw new Error('Property name is required.');
    const site: JobSite = {
      id: makeId('site'),
      name,
      address: address?.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      geofenceRadiusMeters,
      isActive: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
    };
    jobSites = [...jobSites, site];
    logAudit({ userId: currentProfileId, action: 'job_site_created', targetTable: 'job_sites', targetId: site.id, oldValues: null, newValues: { ...site } });
    return { ...site };
  },

  async updateJobSite({ jobSiteId, patch }) {
    await delay();
    const site = jobSites.find((candidate) => candidate.id === jobSiteId);
    if (!site) throw new Error('Property not found.');
    const oldValues = { ...site };
    Object.assign(site, patch);
    logAudit({ userId: currentProfileId, action: 'job_site_updated', targetTable: 'job_sites', targetId: site.id, oldValues, newValues: { ...site } });
    return { ...site };
  },

  async updateJobCode({ jobCodeId, patch }) {
    await delay();
    const job = jobCodes.find((candidate) => candidate.id === jobCodeId);
    if (!job) throw new Error('Job code not found.');
    const oldValues = { ...job };
    const nextCode = patch.code === undefined ? job.code : normalizeJobCode(patch.code);
    if (nextCode && !/^[A-Z]{2}\d{4}$/.test(nextCode)) throw new Error('Job code must use two letters followed by four digits.');
    if (nextCode && jobCodes.some((candidate) => candidate.id !== job.id && candidate.code === nextCode)) throw new Error('That job code is already in use.');
    Object.assign(job, { ...patch, code: nextCode });
    logAudit({ userId: currentProfileId, action: 'job_code_updated', targetTable: 'job_codes', targetId: job.id, oldValues, newValues: { ...job } });
    return { ...job };
  },

  async approveTimesheet({ userId, weekStart, weekEnd, approvedBy }) {
    await delay();
    const existing = timesheetApprovals.find((approval) => approval.userId === userId && approval.weekStart === weekStart);
    const approval: TimesheetApproval = existing ?? {
      id: makeId('approval'),
      userId,
      weekStart,
      weekEnd,
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
      rejectionNote: null,
      createdAt: new Date().toISOString(),
    };
    const oldValues = { ...approval };
    approval.weekEnd = weekEnd;
    approval.status = 'approved';
    approval.approvedBy = approvedBy;
    approval.approvedAt = new Date().toISOString();
    approval.rejectionNote = null;
    if (!existing) timesheetApprovals = [...timesheetApprovals, approval];
    logAudit({ userId: approvedBy, action: 'timesheet_approved', targetTable: 'timesheet_approvals', targetId: approval.id, oldValues: existing ? oldValues : null, newValues: { ...approval } });
    return { ...approval };
  },

  async unapproveTimesheet({ approvalId }) {
    await delay();
    const approval = timesheetApprovals.find((candidate) => candidate.id === approvalId);
    if (!approval) throw new Error('Timesheet approval not found.');
    const oldValues = { ...approval };
    approval.status = 'pending';
    approval.approvedBy = null;
    approval.approvedAt = null;
    approval.rejectionNote = null;
    logAudit({ userId: currentProfileId, action: 'timesheet_unapproved', targetTable: 'timesheet_approvals', targetId: approval.id, oldValues, newValues: { ...approval } });
    return { ...approval };
  },

  async updatePayPeriodSettings({ settings, adminPassword }) {
    await delay();
    if (!adminPassword) throw new Error('Admin password is required.');
    const oldValues = { ...payPeriodSettings };
    payPeriodSettings = normalizePayPeriodSettings(settings);
    logAudit({ userId: currentProfileId, action: 'pay_period_settings_updated', targetTable: 'app_settings', targetId: 'pay_period', oldValues, newValues: { ...payPeriodSettings } });
    return { ...payPeriodSettings };
  },

  async listPayrollGrossUpMultipliers() {
    await delay();
    return payrollGrossUpMultipliers
      .slice()
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
      .map((entry) => ({ ...entry }));
  },

  async upsertPayrollGrossUpMultiplier({ effectiveDate, multiplier, adminPassword }) {
    await delay();
    if (!adminPassword) throw new Error('Admin password is required.');
    if (!effectiveDate) throw new Error('An effective date is required.');
    if (!Number.isFinite(multiplier) || multiplier < 1) throw new Error('Enter a multiplier of 1.00 or higher.');
    const existing = payrollGrossUpMultipliers.find((entry) => entry.effectiveDate === effectiveDate);
    if (existing) {
      existing.multiplier = multiplier;
    } else {
      payrollGrossUpMultipliers.push({
        id: `gross-up-${effectiveDate}`,
        effectiveDate,
        multiplier,
        createdAt: new Date().toISOString(),
      });
    }
  },

  async deletePayrollGrossUpMultiplier({ id, adminPassword }) {
    await delay();
    if (!adminPassword) throw new Error('Admin password is required.');
    payrollGrossUpMultipliers = payrollGrossUpMultipliers.filter((entry) => entry.id !== id);
  },

  async listScopeBuilderProjects() {
    await delay();
    return scopeBuilderProjects
      .filter((project) => project.isActive)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => ({ ...project }));
  },

  async getScopeBuilderProject({ projectId }) {
    await delay();
    return cloneScopeBuilderData(projectId);
  },

  async saveScopeBuilderProject({ project, sections, items }) {
    await delay();
    if (!project.jobSiteId || !project.jobCodeId) throw new Error('Choose a property and job code before saving the beta scope.');
    if (!project.title.trim()) throw new Error('Scope title is required.');
    const jobCode = jobCodes.find((candidate) => candidate.id === project.jobCodeId);
    if (!jobCode || jobCode.jobSiteId !== project.jobSiteId) throw new Error('The selected job code does not belong to the selected property.');

    const nowIso = new Date().toISOString();
    let savedProject = project.id && !project.id.startsWith('draft-')
      ? scopeBuilderProjects.find((candidate) => candidate.id === project.id)
      : scopeBuilderProjects.find((candidate) => candidate.jobCodeId === project.jobCodeId && candidate.isActive);

    if (!savedProject) {
      savedProject = {
        id: makeId('scope-builder'),
        jobSiteId: project.jobSiteId,
        jobCodeId: project.jobCodeId,
        title: project.title.trim(),
        notes: project.notes?.trim() || null,
        status: project.status || 'draft',
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      scopeBuilderProjects = [...scopeBuilderProjects, savedProject];
    } else {
      Object.assign(savedProject, {
        jobSiteId: project.jobSiteId,
        jobCodeId: project.jobCodeId,
        title: project.title.trim(),
        notes: project.notes?.trim() || null,
        status: project.status || 'draft',
        isActive: true,
        updatedAt: nowIso,
      });
    }

    const projectId = savedProject.id;
    const sectionIdMap = new Map<string, string>();
    const activeSectionIds = new Set<string>();
    sections.forEach((section, index) => {
      const title = section.title.trim();
      if (!title) return;
      let savedSection = section.id && !section.id.startsWith('draft-')
        ? scopeBuilderSections.find((candidate) => candidate.id === section.id && candidate.projectId === projectId)
        : undefined;
      if (!savedSection) {
        savedSection = {
          id: makeId('scope-builder-section'),
          projectId,
          title,
          sortOrder: (index + 1) * 10,
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        scopeBuilderSections = [...scopeBuilderSections, savedSection];
      } else {
        Object.assign(savedSection, {
          title,
          sortOrder: (index + 1) * 10,
          isActive: true,
          updatedAt: nowIso,
        });
      }
      sectionIdMap.set(section.id, savedSection.id);
      activeSectionIds.add(savedSection.id);
    });
    scopeBuilderSections = scopeBuilderSections.map((section) => (
      section.projectId === projectId && !activeSectionIds.has(section.id)
        ? { ...section, isActive: false, updatedAt: nowIso }
        : section
    ));

    const activeItemIds = new Set<string>();
    items.forEach((item) => {
      const itemText = item.itemText.trim();
      const sectionId = sectionIdMap.get(item.sectionId) || item.sectionId;
      if (!itemText || !activeSectionIds.has(sectionId)) return;
      const sectionItems = items.filter((candidate) => candidate.sectionId === item.sectionId && candidate.itemText.trim());
      let savedItem = item.id && !item.id.startsWith('draft-')
        ? scopeBuilderItems.find((candidate) => candidate.id === item.id && candidate.projectId === projectId)
        : undefined;
      if (!savedItem) {
        savedItem = {
          id: makeId('scope-builder-item'),
          projectId,
          sectionId,
          itemText,
          sortOrder: (sectionItems.findIndex((candidate) => candidate.id === item.id) + 1) * 10,
          isComplete: item.isComplete,
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        scopeBuilderItems = [...scopeBuilderItems, savedItem];
      } else {
        Object.assign(savedItem, {
          sectionId,
          itemText,
          sortOrder: (sectionItems.findIndex((candidate) => candidate.id === item.id) + 1) * 10,
          isComplete: item.isComplete,
          isActive: true,
          updatedAt: nowIso,
        });
      }
      activeItemIds.add(savedItem.id);
    });
    scopeBuilderItems = scopeBuilderItems.map((item) => (
      item.projectId === projectId && !activeItemIds.has(item.id)
        ? { ...item, isActive: false, updatedAt: nowIso }
        : item
    ));

    logAudit({ userId: currentProfileId, action: 'scope_builder_saved', targetTable: 'scope_builder_projects', targetId: projectId, oldValues: null, newValues: { projectId } });
    return cloneScopeBuilderData(projectId);
  },

  async listAuditLogs(params) {
    await delay();
    return auditLogs
      .filter((log) => {
        if (params?.targetTable && log.targetTable !== params.targetTable) return false;
        if (params?.targetId && log.targetId !== params.targetId) return false;
        return true;
      })
      .map((log) => ({ ...log }));
  },
};

function generateMockJobCode(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2).padEnd(2, 'J') || 'JC';
  let sequence = 1;
  let code = `${letters}${sequence.toString().padStart(4, '0')}`;
  while (jobCodes.some((job) => job.code === code)) {
    sequence += 1;
    code = `${letters}${sequence.toString().padStart(4, '0')}`;
  }
  return code;
}

function normalizeJobCode(code: string | null | undefined) {
  return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
