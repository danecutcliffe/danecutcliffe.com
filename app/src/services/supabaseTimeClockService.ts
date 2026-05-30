import type { SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '../config/env';
import type { GpsPoint, JobCode, JobSite, PayPeriodSettings, PayrollGrossUpMultiplier, Profile, ScopeBuilderData, ScopeBuilderItem, ScopeBuilderProject, ScopeBuilderSection, TimeEntry } from '../domain/types';
import { defaultPayPeriodSettings, normalizePayPeriodSettings } from '../hooks/usePayPeriodSettings';
import { getBrowserPasskeySupport } from '../utils/passkeys';
import { createSupabaseBrowserClient } from './supabase/client';
import { mapAuditLog, mapJobCode, mapJobSite, mapProfile, mapScopeBuilderData, mapScopeBuilderProject, mapTimeEntry, mapTimesheetApproval, type AuditLogRow, type JobCodeRow, type JobSiteRow, type ProfileRow, type ScopeBuilderItemRow, type ScopeBuilderProjectRow, type ScopeBuilderSectionRow, type TimeEntryRow, type TimesheetApprovalRow } from './supabase/mappers';
import type { AdminTimeClockService, PasskeyInfo, ScopeBuilderSaveInput } from './TimeClockService';

type SupabaseResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

const unwrap = <T>(response: SupabaseResponse<T>, fallbackMessage = 'Supabase request failed.'): T => {
  if (response.error) {
    if (response.error.message.includes('job_codes_name_key')) {
      throw new Error('The database still has the old global job-title uniqueness rule. Apply the generated job-code Supabase migration before adding duplicate titles under different properties.');
    }
    throw new Error(response.error.message);
  }
  if (response.data === null) throw new Error(fallbackMessage);
  return response.data;
};

const capturedLat = (gps?: GpsPoint | null) => (gps?.status === 'captured' ? gps.lat ?? null : null);
const capturedLng = (gps?: GpsPoint | null) => (gps?.status === 'captured' ? gps.lng ?? null : null);
const isPersistedScopeBuilderId = (id: string | undefined) => Boolean(id && !id.startsWith('draft-'));

class SupabaseTimeClockService implements AdminTimeClockService {
  readonly mode = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  onAuthStateChange(callback: () => void) {
    const { data } = this.client.auth.onAuthStateChange(() => callback());
    return () => data.subscription.unsubscribe();
  }

  async signIn({ email, password }: { email: string; password: string }) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async signInWithPasskey() {
    const { error } = await this.client.auth.signInWithPasskey();
    if (error) throw new Error(error.message);
  }

  async signUp({ email, password, firstName, lastName }: { email: string; password: string; firstName: string; lastName: string }) {
    const { error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appConfig.supabaseEmailRedirectTo,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });
    if (error) throw new Error(error.message);
  }

  async resetPassword({ email }: { email: string }) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: appConfig.supabaseEmailRedirectTo,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword({ currentPassword, password }: { currentPassword: string; password: string }) {
    await this.verifyCurrentUserPassword(currentPassword);
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }

  async getPasskeySupport() {
    return getBrowserPasskeySupport();
  }

  async registerPasskey({ friendlyName }: { friendlyName?: string } = {}): Promise<PasskeyInfo> {
    const { data, error } = await this.client.auth.registerPasskey();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Passkey registration did not return a credential.');

    if (friendlyName) {
      const { data: updated, error: updateError } = await this.client.auth.passkey.update({
        passkeyId: data.id,
        friendlyName,
      });
      if (updateError) throw new Error(updateError.message);
      if (updated) return mapPasskeyInfo(updated);
    }

    return mapPasskeyInfo(data);
  }

  async listPasskeys(): Promise<PasskeyInfo[]> {
    if (!(await this.hasSession())) return [];
    const { data, error } = await this.client.auth.passkey.list();
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPasskeyInfo);
  }

  async deletePasskey({ passkeyId }: { passkeyId: string }) {
    const { error } = await this.client.auth.passkey.delete({ passkeyId });
    if (error) throw new Error(error.message);
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getCurrentProfile() {
    const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    if (!sessionData.session) return null;

    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError) {
      if (userError.message.toLowerCase().includes('auth session missing')) {
        await this.client.auth.signOut();
        return null;
      }
      throw new Error(userError.message);
    }
    if (!userData.user) return null;

    const response = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (response.error) throw new Error(response.error.message);
    return response.data ? mapProfile(response.data as ProfileRow) : null;
  }

  async listProfiles() {
    if (!(await this.hasSession())) return [];
    const rows = unwrap(
      await this.client
        .from('profiles')
        .select('*')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true }) as SupabaseResponse<ProfileRow[]>,
      'Unable to load profiles.',
    );
    return rows.map(mapProfile);
  }

  async listJobSites() {
    if (!(await this.hasSession())) return [];
    const rows = unwrap(
      await this.client
        .from('job_sites')
        .select('*')
        .order('name', { ascending: true }) as SupabaseResponse<JobSiteRow[]>,
      'Unable to load properties.',
    );
    return rows.map(mapJobSite);
  }

  async listJobCodes() {
    if (!(await this.hasSession())) return [];
    const rows = unwrap(
      await this.client
        .from('job_codes')
        .select('*')
        .order('name', { ascending: true }) as SupabaseResponse<JobCodeRow[]>,
      'Unable to load job codes.',
    );
    return rows.map(mapJobCode);
  }

  async listTimeEntries(params: { userId?: string; start?: string; end?: string; jobCodeId?: string }) {
    if (!(await this.hasSession())) return [];
    let query = this.client.from('time_entries').select('*').order('clock_in', { ascending: false });
    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.jobCodeId) query = query.eq('job_code_id', params.jobCodeId);
    if (params.start) query = query.gte('clock_in', params.start);
    if (params.end) query = query.lte('clock_in', params.end);
    const rows = unwrap(await query as SupabaseResponse<TimeEntryRow[]>, 'Unable to load time entries.');
    return rows.map(mapTimeEntry);
  }

  async listTimesheetApprovals(params: { userId?: string; weekStart?: string } = {}) {
    if (!(await this.hasSession())) return [];
    let query = this.client.from('timesheet_approvals').select('*').order('week_start', { ascending: false });
    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.weekStart) query = query.eq('week_start', params.weekStart);
    const rows = unwrap(await query as SupabaseResponse<TimesheetApprovalRow[]>, 'Unable to load timesheet approvals.');
    return rows.map(mapTimesheetApproval);
  }

  async getPayPeriodSettings() {
    if (!(await this.hasSession())) return defaultPayPeriodSettings();
    const response = await this.client
      .from('app_settings')
      .select('value')
      .eq('key', 'pay_period')
      .maybeSingle();

    if (response.error) throw new Error(response.error.message);
    return normalizePayPeriodSettings(response.data?.value as Partial<PayPeriodSettings> | null | undefined);
  }

  async getOpenWorkEntry(userId: string) {
    return this.getOpenEntry(userId, 'work');
  }

  async getOpenBreakEntry(userId: string) {
    return this.getOpenEntry(userId, 'break');
  }

  async clockIn({ userId, jobCodeId, at, gps }: { userId: string; jobCodeId: string; at: string; gps?: GpsPoint | null }) {
    await this.assertCanPunchFor(userId);
    const existing = await this.getOpenWorkEntry(userId);
    if (existing) throw new Error('You are already clocked in.');

    const row = unwrap(
      await this.client
        .from('time_entries')
        .insert({
          user_id: userId,
          job_code_id: jobCodeId,
          event_type: 'work',
          clock_in: at,
          clock_in_lat: capturedLat(gps),
          clock_in_lng: capturedLng(gps),
          notes: '',
          created_by: userId,
        })
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to clock in.',
    );
    return mapTimeEntry(row);
  }

  async clockOut({ entryId, at, gps }: { entryId: string; at: string; gps?: GpsPoint | null }) {
    const profile = await this.requireCurrentProfile();
    const row = unwrap(
      await this.client
        .from('time_entries')
        .update({
          clock_out: at,
          clock_out_lat: capturedLat(gps),
          clock_out_lng: capturedLng(gps),
          edited_by: profile.id,
        })
        .eq('id', entryId)
        .is('clock_out', null)
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to clock out. This entry may already be closed.',
    );
    return mapTimeEntry(row);
  }

  async startBreak({ userId, at, gps }: { userId: string; jobCodeId?: string | null; at: string; gps?: GpsPoint | null }) {
    await this.assertCanPunchFor(userId);
    const existing = await this.getOpenBreakEntry(userId);
    if (existing) throw new Error('A break is already in progress.');

    const row = unwrap(
      await this.client
        .from('time_entries')
        .insert({
          user_id: userId,
          job_code_id: null,
          event_type: 'break',
          clock_in: at,
          clock_in_lat: capturedLat(gps),
          clock_in_lng: capturedLng(gps),
          notes: 'Break',
          created_by: userId,
        })
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to start break.',
    );
    return mapTimeEntry(row);
  }

  async endBreak({ entryId, at, gps }: { entryId: string; at: string; gps?: GpsPoint | null }) {
    const profile = await this.requireCurrentProfile();
    const row = unwrap(
      await this.client
        .from('time_entries')
        .update({
          clock_out: at,
          clock_out_lat: capturedLat(gps),
          clock_out_lng: capturedLng(gps),
          edited_by: profile.id,
        })
        .eq('id', entryId)
        .eq('event_type', 'break')
        .is('clock_out', null)
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to end break. This break may already be closed.',
    );
    return mapTimeEntry(row);
  }

  async switchJob({ userId, fromEntryId, toJobCodeId, at, gps }: { userId: string; fromEntryId: string; toJobCodeId: string; at: string; gps?: GpsPoint | null }) {
    await this.assertCanPunchFor(userId);
    const closedEntry = await this.clockOut({ entryId: fromEntryId, at, gps });
    const openedEntry = await this.clockIn({ userId, jobCodeId: toJobCodeId, at, gps });
    return { closedEntry, openedEntry };
  }

  async updateEntryNotes({ entryId, notes }: { entryId: string; notes: string }) {
    const profile = await this.requireCurrentProfile();
    const row = unwrap(
      await this.client
        .from('time_entries')
        .update({ notes, edited_by: profile.id, edited_at: new Date().toISOString() })
        .eq('id', entryId)
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to update entry notes.',
    );
    return mapTimeEntry(row);
  }

  async createManualEntry({ userId, jobCodeId, eventType = 'work', clockIn, clockOut, notes, createdBy }: { userId: string; jobCodeId: string | null; eventType: TimeEntry['eventType']; clockIn: string; clockOut?: string | null; notes: string; createdBy: string }) {
    await this.assertAdmin();
    if (eventType === 'work' && !jobCodeId) throw new Error('Manual work entries need a job code.');
    if (eventType === 'break' && !clockOut) throw new Error('Manual break entries need a punch out time.');
    if (clockOut && new Date(clockOut).getTime() <= new Date(clockIn).getTime()) throw new Error('Clock out must be after clock in.');

    const row = unwrap(
      await this.client
        .from('time_entries')
        .insert({
          user_id: userId,
          job_code_id: eventType === 'break' ? null : jobCodeId,
          event_type: eventType,
          clock_in: clockIn,
          clock_out: clockOut || null,
          notes: notes || (eventType === 'break' ? 'Break' : ''),
          created_by: createdBy,
        })
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to create manual entry.',
    );
    return mapTimeEntry(row);
  }

  async updateTimeEntry({ entryId, patch, editedBy }: { entryId: string; patch: Partial<Pick<TimeEntry, 'jobCodeId' | 'clockIn' | 'clockOut' | 'notes'>>; editedBy: string }) {
    await this.assertAdmin();
    const update: Record<string, string | null> = {
      edited_by: editedBy,
      edited_at: new Date().toISOString(),
    };
    if (patch.clockIn !== undefined) update.clock_in = patch.clockIn;
    if (patch.clockOut !== undefined) update.clock_out = patch.clockOut;
    if (patch.jobCodeId !== undefined) update.job_code_id = patch.jobCodeId;
    if (patch.notes !== undefined) update.notes = patch.notes;

    const row = unwrap(
      await this.client
        .from('time_entries')
        .update(update)
        .eq('id', entryId)
        .select('*')
        .single() as SupabaseResponse<TimeEntryRow>,
      'Unable to update time entry.',
    );
    return mapTimeEntry(row);
  }

  async deleteTimeEntry({ entryId }: { entryId: string }) {
    await this.assertAdmin();
    const { error } = await this.client
      .from('time_entries')
      .delete()
      .eq('id', entryId);
    if (error) throw new Error(error.message);
  }

  async updateProfile({ profileId, patch }: { profileId: string; patch: Partial<Pick<Profile, 'firstName' | 'lastName' | 'role' | 'workerType' | 'contractorHstApplicable' | 'hourlyRate' | 'paidBreaks' | 'paidBreakMinutes' | 'canAccessScopes' | 'isActive' | 'isRejected'>> }) {
    await this.assertAdmin();
    const update: Record<string, string | number | boolean> = {};
    if (patch.firstName !== undefined) update.first_name = patch.firstName;
    if (patch.lastName !== undefined) update.last_name = patch.lastName;
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.workerType !== undefined) update.worker_type = patch.workerType;
    if (patch.contractorHstApplicable !== undefined) update.contractor_hst_applicable = patch.contractorHstApplicable;
    if (patch.hourlyRate !== undefined) update.hourly_rate = patch.hourlyRate;
    if (patch.paidBreaks !== undefined) update.paid_breaks = patch.paidBreaks;
    if (patch.paidBreakMinutes !== undefined) update.paid_break_minutes = patch.paidBreakMinutes;
    if (patch.canAccessScopes !== undefined) update.can_access_scopes = patch.canAccessScopes;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (patch.isRejected !== undefined) update.is_rejected = patch.isRejected;

    const row = unwrap(
      await this.client
        .from('profiles')
        .update(update)
        .eq('id', profileId)
        .select('*')
        .single() as SupabaseResponse<ProfileRow>,
      'Unable to update profile.',
    );

    if (patch.firstName !== undefined || patch.lastName !== undefined) {
      const profile = mapProfile(row);
      await this.client.rpc('admin_update_employee_name', {
        p_profile_id: profileId,
        p_first_name: profile.firstName,
        p_last_name: profile.lastName,
      });
    }

    return mapProfile(row);
  }

  async deleteProfile({ profileId }: { profileId: string }) {
    await this.assertAdmin();
    const { error } = await this.client.rpc('delete_employee_account', { target_profile_id: profileId });
    if (error) throw new Error(error.message);
  }

  async rejectSignup({ profileId }: { profileId: string }) {
    await this.assertAdmin();
    const { error } = await this.client.rpc('reject_pending_signup', { target_profile_id: profileId });
    if (error) throw new Error(error.message);
  }

  async createProfile({ email, firstName, lastName, role, workerType, contractorHstApplicable, hourlyRate, paidBreaks, paidBreakMinutes, canAccessScopes }: { authUserId?: string; email: string; firstName: string; lastName: string; role: Profile['role']; workerType: Profile['workerType']; contractorHstApplicable: boolean; hourlyRate: number; paidBreaks: boolean; paidBreakMinutes: number; canAccessScopes: boolean; isActive: boolean }) {
    await this.assertAdmin();
    const { data, error } = await this.client.rpc('admin_create_employee', {
      p_email: email.trim(),
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_role: role,
      p_worker_type: workerType,
      p_contractor_hst_applicable: contractorHstApplicable,
      p_hourly_rate: hourlyRate,
      p_paid_breaks: paidBreaks,
      p_paid_break_minutes: paidBreakMinutes,
      p_can_access_scopes: canAccessScopes,
    });
    if (error) throw new Error(error.message);

    const row = unwrap(
      await this.client
        .from('profiles')
        .select('*')
        .eq('id', data)
        .single() as SupabaseResponse<ProfileRow>,
      'Employee was created but profile could not be read back.',
    );

    await this.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appConfig.supabaseEmailRedirectTo,
    });

    return mapProfile(row);
  }

  async createJobCode({ jobSiteId, code, name, description }: { jobSiteId?: string | null; code?: string; name: string; description?: string }) {
    await this.assertAdmin();
    if (!name.trim()) throw new Error('Job title is required.');
    const row = unwrap(
      await this.client
        .from('job_codes')
        .insert({ job_site_id: jobSiteId || null, code: code?.trim() || null, name, description: description?.trim() || null, is_archived: false })
        .select('*')
        .single() as SupabaseResponse<JobCodeRow>,
      'Unable to create job code.',
    );
    return mapJobCode(row);
  }

  async updateJobCode({ jobCodeId, patch }: { jobCodeId: string; patch: Partial<Pick<JobCode, 'jobSiteId' | 'code' | 'name' | 'description' | 'isActive' | 'isArchived'>> }) {
    await this.assertAdmin();
    const update: Record<string, string | boolean | null> = {};
    if (patch.jobSiteId !== undefined) update.job_site_id = patch.jobSiteId ?? null;
    if (patch.code !== undefined) update.code = patch.code;
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description ?? null;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

    const row = unwrap(
      await this.client
        .from('job_codes')
        .update(update)
        .eq('id', jobCodeId)
        .select('*')
        .single() as SupabaseResponse<JobCodeRow>,
      'Unable to update job code.',
    );
    return mapJobCode(row);
  }

  async approveTimesheet({ userId, weekStart, weekEnd, approvedBy }: { userId: string; weekStart: string; weekEnd: string; approvedBy: string }) {
    await this.assertAdmin();
    const row = unwrap(
      await this.client
        .from('timesheet_approvals')
        .upsert({
          user_id: userId,
          week_start: weekStart,
          week_end: weekEnd,
          status: 'approved',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          rejection_note: null,
        }, { onConflict: 'user_id,week_start' })
        .select('*')
        .single() as SupabaseResponse<TimesheetApprovalRow>,
      'Unable to approve timesheet.',
    );
    return mapTimesheetApproval(row);
  }

  async unapproveTimesheet({ approvalId }: { approvalId: string }) {
    await this.assertAdmin();
    const row = unwrap(
      await this.client
        .from('timesheet_approvals')
        .update({
          status: 'pending',
          approved_by: null,
          approved_at: null,
          rejection_note: null,
        })
        .eq('id', approvalId)
        .select('*')
        .single() as SupabaseResponse<TimesheetApprovalRow>,
      'Unable to unlock timesheet.',
    );
    return mapTimesheetApproval(row);
  }

  async updatePayPeriodSettings({ settings, adminPassword }: { settings: PayPeriodSettings; adminPassword: string }) {
    const profile = await this.assertAdmin();
    await this.verifyCurrentUserPassword(adminPassword, profile);
    const normalized = normalizePayPeriodSettings(settings);
    const { error } = await this.client
      .from('app_settings')
      .upsert({
        key: 'pay_period',
        value: normalized,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) throw new Error(error.message);
    return normalized;
  }

  async listPayrollGrossUpMultipliers(): Promise<PayrollGrossUpMultiplier[]> {
    if (!(await this.hasSession())) return [];
    const { data, error } = await this.client
      .from('payroll_gross_up_multipliers')
      .select('id, effective_date, multiplier, created_at')
      .order('effective_date', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; effective_date: string; multiplier: number | string; created_at: string | null }>;
    return rows.map((row) => ({
      id: row.id,
      effectiveDate: row.effective_date,
      multiplier: Number(row.multiplier),
      createdAt: row.created_at ?? undefined,
    }));
  }

  async upsertPayrollGrossUpMultiplier({ effectiveDate, multiplier, adminPassword }: { effectiveDate: string; multiplier: number; adminPassword: string }) {
    const profile = await this.assertAdmin();
    await this.verifyCurrentUserPassword(adminPassword, profile);
    if (!effectiveDate) throw new Error('An effective date is required.');
    if (!Number.isFinite(multiplier) || multiplier < 1) throw new Error('Enter a multiplier of 1.00 or higher.');
    const { error } = await this.client
      .from('payroll_gross_up_multipliers')
      .upsert({
        effective_date: effectiveDate,
        multiplier,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'effective_date' });
    if (error) throw new Error(error.message);
  }

  async deletePayrollGrossUpMultiplier({ id, adminPassword }: { id: string; adminPassword: string }) {
    const profile = await this.assertAdmin();
    await this.verifyCurrentUserPassword(adminPassword, profile);
    const { error } = await this.client
      .from('payroll_gross_up_multipliers')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listScopeBuilderProjects(): Promise<ScopeBuilderProject[]> {
    await this.assertAdmin();
    const rows = unwrap(
      await this.client
        .from('scope_builder_projects')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false }) as SupabaseResponse<ScopeBuilderProjectRow[]>,
      'Unable to load beta scopes.',
    );
    return rows.map(mapScopeBuilderProject);
  }

  async getScopeBuilderProject({ projectId }: { projectId: string }): Promise<ScopeBuilderData> {
    await this.assertAdmin();
    const project = unwrap(
      await this.client
        .from('scope_builder_projects')
        .select('*')
        .eq('id', projectId)
        .eq('is_active', true)
        .single() as SupabaseResponse<ScopeBuilderProjectRow>,
      'Unable to load beta scope.',
    );
    const [sectionRows, itemRows] = await Promise.all([
      this.client
        .from('scope_builder_sections')
        .select('*')
        .eq('scope_builder_project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }) as PromiseLike<SupabaseResponse<ScopeBuilderSectionRow[]>>,
      this.client
        .from('scope_builder_items')
        .select('*')
        .eq('scope_builder_project_id', projectId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }) as PromiseLike<SupabaseResponse<ScopeBuilderItemRow[]>>,
    ]);
    return mapScopeBuilderData(
      project,
      unwrap(await sectionRows, 'Unable to load beta scope sections.'),
      unwrap(await itemRows, 'Unable to load beta scope line items.'),
    );
  }

  async saveScopeBuilderProject({ project, sections, items }: ScopeBuilderSaveInput): Promise<ScopeBuilderData> {
    const profile = await this.assertAdmin();
    const title = project.title.trim();
    if (!project.jobSiteId || !project.jobCodeId) throw new Error('Choose a property and job code before saving the beta scope.');
    if (!title) throw new Error('Scope title is required.');

    const linkedJob = unwrap(
      await this.client
        .from('job_codes')
        .select('id,job_site_id')
        .eq('id', project.jobCodeId)
        .single() as SupabaseResponse<{ id: string; job_site_id: string | null }>,
      'Unable to verify the selected job code.',
    );
    if (linkedJob.job_site_id !== project.jobSiteId) {
      throw new Error('The selected job code does not belong to the selected property.');
    }

    const projectPayload = {
      job_site_id: project.jobSiteId,
      job_code_id: project.jobCodeId,
      title,
      notes: project.notes?.trim() || null,
      status: project.status || 'draft',
      is_active: true,
      updated_by: profile.id,
    };

    let projectRow: ScopeBuilderProjectRow | null = null;
    if (isPersistedScopeBuilderId(project.id)) {
      projectRow = unwrap(
        await this.client
          .from('scope_builder_projects')
          .update(projectPayload)
          .eq('id', project.id)
          .select('*')
          .single() as SupabaseResponse<ScopeBuilderProjectRow>,
        'Unable to save beta scope.',
      );
    } else {
      const existing = await this.client
        .from('scope_builder_projects')
        .select('*')
        .eq('job_code_id', project.jobCodeId)
        .eq('is_active', true)
        .maybeSingle() as SupabaseResponse<ScopeBuilderProjectRow>;

      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        projectRow = unwrap(
          await this.client
            .from('scope_builder_projects')
            .update(projectPayload)
            .eq('id', existing.data.id)
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderProjectRow>,
          'Unable to save beta scope.',
        );
      } else {
        projectRow = unwrap(
          await this.client
            .from('scope_builder_projects')
            .insert({ ...projectPayload, created_by: profile.id })
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderProjectRow>,
          'Unable to create beta scope.',
        );
      }
    }

    const projectId = projectRow.id;
    const existingSections = unwrap(
      await this.client
        .from('scope_builder_sections')
        .select('*')
        .eq('scope_builder_project_id', projectId)
        .eq('is_active', true) as SupabaseResponse<ScopeBuilderSectionRow[]>,
      'Unable to load beta scope sections.',
    );
    const existingSectionIds = new Set(existingSections.map((section) => section.id));
    const activeSectionIds = new Set<string>();
    const sectionIdMap = new Map<string, string>();

    for (const [index, section] of sections.entries()) {
      const sectionTitle = section.title.trim();
      if (!sectionTitle) continue;
      const payload = {
        scope_builder_project_id: projectId,
        title: sectionTitle,
        sort_order: (index + 1) * 10,
        is_active: true,
        updated_by: profile.id,
      };
      const row = isPersistedScopeBuilderId(section.id) && existingSectionIds.has(section.id)
        ? unwrap(
          await this.client
            .from('scope_builder_sections')
            .update(payload)
            .eq('id', section.id)
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderSectionRow>,
          'Unable to save beta scope section.',
        )
        : unwrap(
          await this.client
            .from('scope_builder_sections')
            .insert({ ...payload, created_by: profile.id })
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderSectionRow>,
          'Unable to create beta scope section.',
        );
      activeSectionIds.add(row.id);
      sectionIdMap.set(section.id, row.id);
    }

    const inactiveSectionIds = existingSections
      .map((section) => section.id)
      .filter((id) => !activeSectionIds.has(id));
    if (inactiveSectionIds.length) {
      const { error } = await this.client
        .from('scope_builder_sections')
        .update({ is_active: false, updated_by: profile.id })
        .in('id', inactiveSectionIds);
      if (error) throw new Error(error.message);
    }

    const existingItems = unwrap(
      await this.client
        .from('scope_builder_items')
        .select('*')
        .eq('scope_builder_project_id', projectId)
        .eq('is_active', true) as SupabaseResponse<ScopeBuilderItemRow[]>,
      'Unable to load beta scope line items.',
    );
    const existingItemIds = new Set(existingItems.map((item) => item.id));
    const activeItemIds = new Set<string>();

    for (const item of items) {
      const itemText = item.itemText.trim();
      const sectionId = sectionIdMap.get(item.sectionId) || item.sectionId;
      if (!itemText || !activeSectionIds.has(sectionId)) continue;
      const sectionItems = items.filter((candidate) => candidate.sectionId === item.sectionId && candidate.itemText.trim());
      const payload = {
        scope_builder_project_id: projectId,
        scope_builder_section_id: sectionId,
        item_text: itemText,
        sort_order: (sectionItems.findIndex((candidate) => candidate.id === item.id) + 1) * 10,
        is_complete: item.isComplete,
        is_active: true,
        updated_by: profile.id,
      };
      const row = isPersistedScopeBuilderId(item.id) && existingItemIds.has(item.id)
        ? unwrap(
          await this.client
            .from('scope_builder_items')
            .update(payload)
            .eq('id', item.id)
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderItemRow>,
          'Unable to save beta scope line item.',
        )
        : unwrap(
          await this.client
            .from('scope_builder_items')
            .insert({ ...payload, created_by: profile.id })
            .select('*')
            .single() as SupabaseResponse<ScopeBuilderItemRow>,
          'Unable to create beta scope line item.',
        );
      activeItemIds.add(row.id);
    }

    const inactiveItemIds = existingItems
      .map((item) => item.id)
      .filter((id) => !activeItemIds.has(id));
    if (inactiveItemIds.length) {
      const { error } = await this.client
        .from('scope_builder_items')
        .update({ is_active: false, updated_by: profile.id })
        .in('id', inactiveItemIds);
      if (error) throw new Error(error.message);
    }

    return this.getScopeBuilderProject({ projectId });
  }

  async createJobSite({ name, address, latitude, longitude, geofenceRadiusMeters = 250 }: { name: string; address?: string; latitude?: number | null; longitude?: number | null; geofenceRadiusMeters?: number }) {
    await this.assertAdmin();
    if (!name.trim()) throw new Error('Property name is required.');
    const row = unwrap(
      await this.client
        .from('job_sites')
        .insert({
          name: name.trim(),
          address: address?.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          geofence_radius_meters: geofenceRadiusMeters,
          is_archived: false,
        })
        .select('*')
        .single() as SupabaseResponse<JobSiteRow>,
      'Unable to create property.',
    );
    return mapJobSite(row);
  }

  async updateJobSite({ jobSiteId, patch }: { jobSiteId: string; patch: Partial<Pick<JobSite, 'name' | 'address' | 'latitude' | 'longitude' | 'geofenceRadiusMeters' | 'isActive' | 'isArchived'>> }) {
    await this.assertAdmin();
    const update: Record<string, string | number | boolean | null> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.address !== undefined) update.address = patch.address ?? null;
    if (patch.latitude !== undefined) update.latitude = patch.latitude;
    if (patch.longitude !== undefined) update.longitude = patch.longitude;
    if (patch.geofenceRadiusMeters !== undefined) update.geofence_radius_meters = patch.geofenceRadiusMeters;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (patch.isArchived !== undefined) update.is_archived = patch.isArchived;

    const row = unwrap(
      await this.client
        .from('job_sites')
        .update(update)
        .eq('id', jobSiteId)
        .select('*')
        .single() as SupabaseResponse<JobSiteRow>,
      'Unable to update property.',
    );
    return mapJobSite(row);
  }

  async listAuditLogs(params?: { targetTable?: string; targetId?: string }) {
    await this.assertAdmin();
    let query = this.client.from('audit_log').select('*').order('created_at', { ascending: false });
    if (params?.targetTable) query = query.eq('target_table', params.targetTable);
    if (params?.targetId) query = query.eq('target_id', params.targetId);
    const rows = unwrap(await query as SupabaseResponse<AuditLogRow[]>, 'Unable to load audit logs.');
    return rows.map(mapAuditLog);
  }

  private async getOpenEntry(userId: string, eventType: TimeEntry['eventType']) {
    if (!(await this.hasSession())) return null;
    const response = await this.client
      .from('time_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .is('clock_out', null)
      .maybeSingle();

    if (response.error) throw new Error(response.error.message);
    return response.data ? mapTimeEntry(response.data as TimeEntryRow) : null;
  }

  private async hasSession() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new Error(error.message);
    return Boolean(data.session);
  }

  private async requireCurrentProfile() {
    const profile = await this.getCurrentProfile();
    if (!profile) throw new Error('Please sign in before using the time clock.');
    if (!profile.isActive) throw new Error('This account is inactive. Ask an admin to reactivate it.');
    return profile;
  }

  private async assertCanPunchFor(userId: string) {
    const profile = await this.requireCurrentProfile();
    if (profile.role !== 'admin' && profile.id !== userId) throw new Error('You cannot punch time for another employee.');
  }

  private async assertAdmin() {
    const profile = await this.requireCurrentProfile();
    if (profile.role !== 'admin') throw new Error('Admin access is required.');
    return profile;
  }

  private async verifyCurrentUserPassword(password: string, profile?: Profile) {
    if (!password) throw new Error('Current password is required.');
    const currentProfile = profile ?? await this.requireCurrentProfile();
    const { error } = await this.client.auth.signInWithPassword({
      email: currentProfile.email,
      password,
    });
    if (error) throw new Error('Current password was not accepted.');
  }
}

const mapPasskeyInfo = (passkey: { id: string; friendly_name?: string; created_at: string; last_used_at?: string }): PasskeyInfo => ({
  id: passkey.id,
  friendlyName: passkey.friendly_name,
  createdAt: passkey.created_at,
  lastUsedAt: passkey.last_used_at,
});

export const createSupabaseTimeClockService = (): AdminTimeClockService => new SupabaseTimeClockService(createSupabaseBrowserClient());
