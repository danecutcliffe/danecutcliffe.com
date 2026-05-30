export type AppRole = 'employee' | 'admin';
export type WorkerType = 'employee' | 'contractor';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TimeEventType = 'work' | 'break';
export type GpsStatus = 'captured' | 'missing' | 'unsupported' | 'denied';

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  workerType: WorkerType;
  contractorHstApplicable: boolean;
  hourlyRate: number;
  paidBreaks: boolean;
  paidBreakMinutes: number;
  canAccessScopes: boolean;
  isActive: boolean;
  isRejected?: boolean;
  createdAt: string;
}

export interface JobCode {
  id: string;
  jobSiteId?: string | null;
  code?: string | null;
  name: string;
  description?: string;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface JobSite {
  id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters: number;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  jobCodeId: string | null;
  eventType: TimeEventType;
  clockIn: string;
  clockOut?: string | null;
  clockInLat?: number | null;
  clockInLng?: number | null;
  clockOutLat?: number | null;
  clockOutLng?: number | null;
  notes?: string | null;
  isAutoClockedOut: boolean;
  createdBy?: string | null;
  editedBy?: string | null;
  editedAt?: string | null;
  createdAt: string;
}

export interface TimesheetApproval {
  id: string;
  userId: string;
  weekStart: string;
  weekEnd: string;
  status: ApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionNote?: string | null;
  createdAt: string;
}

export interface PayPeriodSettings {
  anchorStart: string;
  lengthDays: number;
  // Deprecated: superseded by the effective-dated PayrollGrossUpMultiplier history.
  // Retained for backward compatibility; no longer the source of truth for cost reporting.
  laborCostMultiplier: number;
}

export interface PayrollGrossUpMultiplier {
  id: string;
  effectiveDate: string;
  multiplier: number;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  createdAt: string;
}

export interface GpsPoint {
  lat?: number;
  lng?: number;
  status: GpsStatus;
}

export type ScopeBuilderStatus = 'draft' | 'ready';

export interface ScopeBuilderProject {
  id: string;
  jobSiteId: string;
  jobCodeId: string;
  title: string;
  notes?: string | null;
  status: ScopeBuilderStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeBuilderSection {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeBuilderItem {
  id: string;
  projectId: string;
  sectionId: string;
  itemText: string;
  sortOrder: number;
  isComplete: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeBuilderData {
  project: ScopeBuilderProject;
  sections: ScopeBuilderSection[];
  items: ScopeBuilderItem[];
}
