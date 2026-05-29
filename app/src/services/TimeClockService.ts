import type { AppRole, AuditLog, GpsPoint, JobCode, JobSite, PayPeriodSettings, Profile, ScopeBuilderData, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection, TimeEntry, TimesheetApproval } from '../domain/types';

export interface PasskeySupport {
  isSupported: boolean;
  label: string;
  unavailableReason?: string;
}

export interface PasskeyInfo {
  id: string;
  friendlyName?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ScopeBuilderSaveInput {
  project: {
    id?: string;
    jobSiteId: string;
    jobCodeId: string;
    title: string;
    notes?: string | null;
    status?: ScopeBuilderProject['status'];
  };
  sections: Array<Pick<ScopeBuilderSection, 'id' | 'title' | 'sortOrder'>>;
  items: Array<Pick<ScopeBuilderItem, 'id' | 'sectionId' | 'itemText' | 'sortOrder' | 'isComplete'>>;
}

export interface TimeClockService {
  readonly mode?: 'mock' | 'supabase';

  getCurrentProfile(): Promise<Profile | null>;
  setMockRole?(role: AppRole): Promise<void>;
  signIn?(params: { email: string; password: string }): Promise<void>;
  signInWithPasskey?(): Promise<void>;
  signUp?(params: { email: string; password: string; firstName: string; lastName: string }): Promise<void>;
  resetPassword?(params: { email: string }): Promise<void>;
  updatePassword?(params: { currentPassword: string; password: string }): Promise<void>;
  getPasskeySupport?(): Promise<PasskeySupport>;
  registerPasskey?(params?: { friendlyName?: string }): Promise<PasskeyInfo>;
  listPasskeys?(): Promise<PasskeyInfo[]>;
  deletePasskey?(params: { passkeyId: string }): Promise<void>;
  signOut?(): Promise<void>;
  onAuthStateChange?(callback: () => void): () => void;

  listProfiles(): Promise<Profile[]>;
  listJobSites(): Promise<JobSite[]>;
  listJobCodes(): Promise<JobCode[]>;
  listTimeEntries(params: {
    userId?: string;
    start?: string;
    end?: string;
    jobCodeId?: string;
  }): Promise<TimeEntry[]>;
  listTimesheetApprovals(params?: {
    userId?: string;
    weekStart?: string;
  }): Promise<TimesheetApproval[]>;
  getPayPeriodSettings(): Promise<PayPeriodSettings>;
  getOpenWorkEntry(userId: string): Promise<TimeEntry | null>;
  getOpenBreakEntry(userId: string): Promise<TimeEntry | null>;

  clockIn(params: {
    userId: string;
    jobCodeId: string;
    at: string;
    gps?: GpsPoint | null;
  }): Promise<TimeEntry>;

  clockOut(params: {
    entryId: string;
    at: string;
    gps?: GpsPoint | null;
  }): Promise<TimeEntry>;

  startBreak(params: {
    userId: string;
    jobCodeId?: string | null;
    at: string;
    gps?: GpsPoint | null;
  }): Promise<TimeEntry>;

  endBreak(params: {
    entryId: string;
    at: string;
    gps?: GpsPoint | null;
  }): Promise<TimeEntry>;

  switchJob(params: {
    userId: string;
    fromEntryId: string;
    toJobCodeId: string;
    at: string;
    gps?: GpsPoint | null;
  }): Promise<{ closedEntry: TimeEntry; openedEntry: TimeEntry }>;

  updateEntryNotes(params: {
    entryId: string;
    notes: string;
  }): Promise<TimeEntry>;
}

export interface AdminTimeClockService extends TimeClockService {
  createManualEntry(params: {
    userId: string;
    jobCodeId: string | null;
    eventType: TimeEntry['eventType'];
    clockIn: string;
    clockOut?: string | null;
    notes: string;
    createdBy: string;
  }): Promise<TimeEntry>;

  updateTimeEntry(params: {
    entryId: string;
    patch: Partial<Pick<TimeEntry, 'jobCodeId' | 'clockIn' | 'clockOut' | 'notes'>>;
    editedBy: string;
  }): Promise<TimeEntry>;

  deleteTimeEntry(params: {
    entryId: string;
  }): Promise<void>;

  updateProfile(params: {
    profileId: string;
    patch: Partial<Pick<Profile, 'firstName' | 'lastName' | 'role' | 'hourlyRate' | 'paidBreaks' | 'paidBreakMinutes' | 'canAccessScopes' | 'isActive' | 'isRejected'>>;
  }): Promise<Profile>;

  deleteProfile?(params: {
    profileId: string;
  }): Promise<void>;

  rejectSignup?(params: {
    profileId: string;
  }): Promise<void>;

  createProfile?(params: {
    authUserId?: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Profile['role'];
    hourlyRate: number;
    paidBreaks: boolean;
    paidBreakMinutes: number;
    canAccessScopes: boolean;
    isActive: boolean;
  }): Promise<Profile>;

  createJobCode(params: {
    jobSiteId?: string | null;
    code?: string;
    name: string;
    description?: string;
  }): Promise<JobCode>;

  updateJobCode(params: {
    jobCodeId: string;
    patch: Partial<Pick<JobCode, 'jobSiteId' | 'code' | 'name' | 'description' | 'isActive' | 'isArchived'>>;
  }): Promise<JobCode>;

  createJobSite(params: {
    name: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadiusMeters?: number;
  }): Promise<JobSite>;

  updateJobSite(params: {
    jobSiteId: string;
    patch: Partial<Pick<JobSite, 'name' | 'address' | 'latitude' | 'longitude' | 'geofenceRadiusMeters' | 'isActive' | 'isArchived'>>;
  }): Promise<JobSite>;

  listAuditLogs(params?: {
    targetTable?: string;
    targetId?: string;
  }): Promise<AuditLog[]>;

  approveTimesheet(params: {
    userId: string;
    weekStart: string;
    weekEnd: string;
    approvedBy: string;
  }): Promise<TimesheetApproval>;

  unapproveTimesheet(params: {
    approvalId: string;
  }): Promise<TimesheetApproval>;

  updatePayPeriodSettings(params: {
    settings: PayPeriodSettings;
    adminPassword: string;
  }): Promise<PayPeriodSettings>;

  listScopeBuilderProjects(): Promise<ScopeBuilderProject[]>;

  getScopeBuilderProject(params: {
    projectId: string;
  }): Promise<ScopeBuilderData>;

  saveScopeBuilderProject(params: ScopeBuilderSaveInput): Promise<ScopeBuilderData>;
}
