import type { AuditLog, JobCode, JobSite, Profile, ScopeBuilderData, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection, TimeEntry, TimesheetApproval } from '../../domain/types';

export interface ProfileRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Profile['role'];
  worker_type?: Profile['workerType'] | null;
  contractor_hst_applicable?: boolean | null;
  hourly_rate: number | string;
  paid_breaks: boolean;
  paid_break_minutes: number | string;
  can_access_scopes?: boolean;
  is_active: boolean;
  is_rejected?: boolean;
  signup_pending?: boolean;
  created_at: string;
}

export interface JobCodeRow {
  id: string;
  job_site_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface JobSiteRow {
  id: string;
  name: string;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  geofence_radius_meters: number | string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface TimeEntryRow {
  id: string;
  user_id: string;
  job_code_id: string | null;
  event_type: TimeEntry['eventType'];
  clock_in: string;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  notes: string | null;
  is_auto_clocked_out: boolean;
  created_by: string | null;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  target_table: string;
  target_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export interface TimesheetApprovalRow {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  status: TimesheetApproval['status'];
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
}

export interface ScopeBuilderProjectRow {
  id: string;
  job_site_id: string;
  job_code_id: string;
  title: string;
  notes: string | null;
  status: ScopeBuilderProject['status'];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScopeBuilderSectionRow {
  id: string;
  scope_builder_project_id: string;
  title: string;
  sort_order: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScopeBuilderItemRow {
  id: string;
  scope_builder_project_id: string;
  scope_builder_section_id: string;
  item_text: string;
  sort_order: number | string;
  is_complete: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const mapProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  role: row.role,
  workerType: row.worker_type === 'contractor' ? 'contractor' : 'employee',
  contractorHstApplicable: row.contractor_hst_applicable ?? false,
  hourlyRate: Number(row.hourly_rate),
  paidBreaks: row.paid_breaks,
  paidBreakMinutes: Number(row.paid_break_minutes ?? 30),
  canAccessScopes: row.can_access_scopes ?? true,
  isActive: row.is_active,
  isRejected: row.is_rejected ?? false,
  signupPending: row.signup_pending ?? false,
  createdAt: row.created_at,
});

export const mapJobCode = (row: JobCodeRow): JobCode => ({
  id: row.id,
  jobSiteId: row.job_site_id,
  code: row.code,
  name: row.name,
  description: row.description ?? undefined,
  isActive: row.is_active,
  isArchived: row.is_archived,
  createdAt: row.created_at,
});

export const mapJobSite = (row: JobSiteRow): JobSite => ({
  id: row.id,
  name: row.name,
  address: row.address,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
  geofenceRadiusMeters: Number(row.geofence_radius_meters ?? 250),
  isActive: row.is_active,
  isArchived: row.is_archived,
  createdAt: row.created_at,
});

export const mapTimeEntry = (row: TimeEntryRow): TimeEntry => ({
  id: row.id,
  userId: row.user_id,
  jobCodeId: row.job_code_id,
  eventType: row.event_type,
  clockIn: row.clock_in,
  clockOut: row.clock_out,
  clockInLat: row.clock_in_lat,
  clockInLng: row.clock_in_lng,
  clockOutLat: row.clock_out_lat,
  clockOutLng: row.clock_out_lng,
  notes: row.notes,
  isAutoClockedOut: row.is_auto_clocked_out,
  createdBy: row.created_by,
  editedBy: row.edited_by,
  editedAt: row.edited_at,
  createdAt: row.created_at,
});

export const mapAuditLog = (row: AuditLogRow): AuditLog => ({
  id: row.id,
  userId: row.user_id,
  action: row.action,
  targetTable: row.target_table,
  targetId: row.target_id,
  oldValues: row.old_values,
  newValues: row.new_values,
  createdAt: row.created_at,
});

export const mapTimesheetApproval = (row: TimesheetApprovalRow): TimesheetApproval => ({
  id: row.id,
  userId: row.user_id,
  weekStart: row.week_start,
  weekEnd: row.week_end,
  status: row.status,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  rejectionNote: row.rejection_note,
  createdAt: row.created_at,
});

export const mapScopeBuilderProject = (row: ScopeBuilderProjectRow): ScopeBuilderProject => ({
  id: row.id,
  jobSiteId: row.job_site_id,
  jobCodeId: row.job_code_id,
  title: row.title,
  notes: row.notes,
  status: row.status,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapScopeBuilderSection = (row: ScopeBuilderSectionRow): ScopeBuilderSection => ({
  id: row.id,
  projectId: row.scope_builder_project_id,
  title: row.title,
  sortOrder: Number(row.sort_order),
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapScopeBuilderItem = (row: ScopeBuilderItemRow): ScopeBuilderItem => ({
  id: row.id,
  projectId: row.scope_builder_project_id,
  sectionId: row.scope_builder_section_id,
  itemText: row.item_text,
  sortOrder: Number(row.sort_order),
  isComplete: row.is_complete,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapScopeBuilderData = (
  project: ScopeBuilderProjectRow,
  sections: ScopeBuilderSectionRow[],
  items: ScopeBuilderItemRow[],
): ScopeBuilderData => ({
  project: mapScopeBuilderProject(project),
  sections: sections.map(mapScopeBuilderSection),
  items: items.map(mapScopeBuilderItem),
});
