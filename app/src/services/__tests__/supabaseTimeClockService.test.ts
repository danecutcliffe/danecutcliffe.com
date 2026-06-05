import { describe, expect, it, vi } from 'vitest';
import { SupabaseTimeClockService } from '../supabaseTimeClockService';
import type { JobCodeRow, ProfileRow, TimeEntryRow } from '../supabase/mappers';

const employeeId = 'employee-1';

const profileRow: ProfileRow = {
  id: employeeId,
  email: 'employee@example.com',
  first_name: 'Jamie',
  last_name: 'Carpenter',
  role: 'employee',
  worker_type: 'employee',
  contractor_hst_applicable: false,
  hourly_rate: 24,
  paid_breaks: false,
  paid_break_minutes: 30,
  can_access_scopes: true,
  is_active: true,
  is_rejected: false,
  created_at: '2026-01-01T12:00:00.000Z',
};

const adminProfileRow: ProfileRow = {
  ...profileRow,
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

const activeJobCodeRow: JobCodeRow = {
  id: 'job-1',
  job_site_id: 'site-1',
  code: 'QA0358',
  name: 'Carpentry',
  description: null,
  is_active: true,
  is_archived: false,
  created_at: '2026-01-01T12:00:00.000Z',
};

function timeEntryRow(overrides: Partial<TimeEntryRow> = {}): TimeEntryRow {
  return {
    id: 'entry-1',
    user_id: employeeId,
    job_code_id: 'job-1',
    event_type: 'work',
    clock_in: '2026-06-04T12:00:00.000Z',
    clock_out: null,
    clock_in_lat: null,
    clock_in_lng: null,
    clock_out_lat: null,
    clock_out_lng: null,
    notes: '',
    is_auto_clocked_out: false,
    created_by: employeeId,
    edited_by: null,
    edited_at: null,
    created_at: '2026-06-04T12:00:00.000Z',
    ...overrides,
  };
}

function createFakeClient({
  profile = profileRow,
  openWorkEntry = null,
  openBreakEntry = null,
  existingTimeEntry = timeEntryRow(),
  manualBreakWorkEntry = null,
  jobCodeRow = activeJobCodeRow,
  rpcResults = {},
}: {
  profile?: ProfileRow;
  openWorkEntry?: TimeEntryRow | null;
  openBreakEntry?: TimeEntryRow | null;
  existingTimeEntry?: TimeEntryRow | null;
  manualBreakWorkEntry?: TimeEntryRow | null;
  jobCodeRow?: JobCodeRow;
  rpcResults?: Record<string, unknown>;
} = {}) {
  const orFilters: string[] = [];
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => ({
    data: rpcResults[name] ?? timeEntryRow({ id: `${name}-entry` }),
    error: null,
  }));

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: profile, error: null }),
          }),
        }),
      };
    }

    if (table === 'time_entries') {
      const filters: Array<{ column: string; value: unknown }> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          return query;
        },
        lte: (column: string, value: unknown) => {
          filters.push({ column, value });
          return query;
        },
        or: (filter: string) => {
          orFilters.push(filter);
          return query;
        },
        order: () => query,
        limit: () => query,
        is: (column: string, value: unknown) => {
          filters.push({ column, value });
          return query;
        },
        maybeSingle: async () => {
          const eventType = filters.find((filter) => filter.column === 'event_type')?.value;
          const isManualBreakValidation = filters.some((filter) => filter.column === 'clock_in');
          const userIdFilter = filters.find((filter) => filter.column === 'user_id')?.value;
          const clockInFilter = filters.find((filter) => filter.column === 'clock_in')?.value;
          const matchingManualBreakWorkEntry = (() => {
            if (!manualBreakWorkEntry || typeof clockInFilter !== 'string') return null;
            const breakStart = new Date(clockInFilter).getTime();
            const workStart = new Date(manualBreakWorkEntry.clock_in).getTime();
            const workEnd = manualBreakWorkEntry.clock_out ? new Date(manualBreakWorkEntry.clock_out).getTime() : Number.POSITIVE_INFINITY;
            return manualBreakWorkEntry.user_id === userIdFilter && workStart <= breakStart && breakStart < workEnd
              ? manualBreakWorkEntry
              : null;
          })();
          const row = eventType === 'break'
            ? openBreakEntry
            : eventType === 'work'
              ? isManualBreakValidation ? matchingManualBreakWorkEntry : openWorkEntry
              : null;
          return { data: row, error: null };
        },
        single: async () => ({ data: existingTimeEntry, error: existingTimeEntry ? null : { message: 'No rows found' } }),
        insert: (payload: Partial<TimeEntryRow>) => {
          if (profile.role !== 'admin') {
            throw new Error('Employee punch flow should not insert time_entries directly.');
          }
          return {
            select: () => ({
              single: async () => ({ data: timeEntryRow({ ...payload, id: 'manual-entry' }), error: null }),
            }),
          };
        },
        update: (payload: Partial<TimeEntryRow>) => {
          if (profile.role !== 'admin') {
            throw new Error('Employee punch flow should not update time_entries directly.');
          }
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: timeEntryRow({ ...existingTimeEntry, ...payload }), error: null }),
              }),
            }),
          };
        },
        delete: () => {
          if (profile.role !== 'admin') {
            throw new Error('Employee punch flow should not delete time_entries directly.');
          }
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: existingTimeEntry ? { id: existingTimeEntry.id } : null, error: existingTimeEntry ? null : { message: 'No rows found' } }),
              }),
            }),
          };
        },
      };
      return query;
    }

    if (table === 'job_codes') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: jobCodeRow, error: null }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: employeeId } } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: { id: employeeId } }, error: null })),
      signOut: vi.fn(),
    },
    from,
    rpc,
  };

  return {
    client,
    service: new SupabaseTimeClockService(client as never),
    rpc,
    from,
    orFilters,
  };
}

describe('SupabaseTimeClockService employee punch guardrails', () => {
  it('routes clock-in through the server-authoritative RPC', async () => {
    const { service, rpc } = createFakeClient();

    const entry = await service.clockIn({
      userId: employeeId,
      jobCodeId: 'job-1',
      at: '1999-01-01T00:00:00.000Z',
      gps: { status: 'captured', lat: 46.2382, lng: -63.1311 },
    });

    expect(entry.id).toBe('employee_clock_in-entry');
    expect(rpc).toHaveBeenCalledWith('employee_clock_in', {
      p_job_code_id: 'job-1',
      p_clock_in_lat: 46.2382,
      p_clock_in_lng: -63.1311,
    });
  });

  it('routes clock-out through the employee RPC so missing notes are enforced server-side', async () => {
    const { service, rpc } = createFakeClient();

    await service.clockOut({
      entryId: 'entry-1',
      at: '1999-01-01T00:00:00.000Z',
      gps: { status: 'missing' },
    });

    expect(rpc).toHaveBeenCalledWith('employee_clock_out', {
      p_entry_id: 'entry-1',
      p_notes: '',
      p_clock_out_lat: null,
      p_clock_out_lng: null,
    });
  });

  it('requires an open work entry before starting a break', async () => {
    const { service, rpc } = createFakeClient();

    await expect(service.startBreak({
      userId: employeeId,
      at: '2026-06-04T12:30:00.000Z',
    })).rejects.toThrow('You must be clocked in before starting a break.');

    expect(rpc).not.toHaveBeenCalled();
  });

  it('routes break start through the employee RPC after local open-work validation', async () => {
    const { service, rpc } = createFakeClient({ openWorkEntry: timeEntryRow({ id: 'open-work' }) });

    await service.startBreak({
      userId: employeeId,
      at: '1999-01-01T00:00:00.000Z',
      gps: { status: 'captured', lat: 46.2382, lng: -63.1311 },
    });

    expect(rpc).toHaveBeenCalledWith('employee_start_break', {
      p_job_code_id: null,
      p_clock_in_lat: 46.2382,
      p_clock_in_lng: -63.1311,
    });
  });

  it('routes job switching through the atomic employee RPC', async () => {
    const closedEntry = timeEntryRow({ id: 'closed-entry', clock_out: '2026-06-04T14:00:00.000Z' });
    const openedEntry = timeEntryRow({ id: 'opened-entry', job_code_id: 'job-2' });
    const { service, rpc } = createFakeClient({
      rpcResults: {
        employee_switch_job: { closedEntry, openedEntry },
      },
    });

    const result = await service.switchJob({
      userId: employeeId,
      fromEntryId: 'entry-1',
      toJobCodeId: 'job-2',
      at: '1999-01-01T00:00:00.000Z',
      gps: { status: 'captured', lat: 46.2382, lng: -63.1311 },
    });

    expect(result.closedEntry.id).toBe('closed-entry');
    expect(result.openedEntry.jobCodeId).toBe('job-2');
    expect(rpc).toHaveBeenCalledWith('employee_switch_job', {
      p_from_entry_id: 'entry-1',
      p_to_job_code_id: 'job-2',
      p_clock_lat: 46.2382,
      p_clock_lng: -63.1311,
    });
  });

  it('rejects punch attempts for anyone other than the signed-in user', async () => {
    const { service, rpc } = createFakeClient();

    await expect(service.clockIn({
      userId: 'someone-else',
      jobCodeId: 'job-1',
      at: '2026-06-04T12:00:00.000Z',
    })).rejects.toThrow('Employee punch actions can only be saved for the signed-in user.');

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('SupabaseTimeClockService admin time-entry writes', () => {
  it('keeps admin manual entries as direct audited writes after validating the job code', async () => {
    const { service, from } = createFakeClient({ profile: adminProfileRow });

    const entry = await service.createManualEntry({
      userId: employeeId,
      jobCodeId: 'job-1',
      eventType: 'work',
      clockIn: '2026-06-04T12:00:00.000Z',
      clockOut: '2026-06-04T16:00:00.000Z',
      notes: 'Admin correction',
      createdBy: adminProfileRow.id,
    });

    expect(entry.id).toBe('manual-entry');
    expect(from).toHaveBeenCalledWith('job_codes');
    expect(from).toHaveBeenCalledWith('time_entries');
  });

  it('rejects inactive or archived job codes before creating admin manual work entries', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      jobCodeRow: { ...activeJobCodeRow, is_active: false },
    });

    await expect(service.createManualEntry({
      userId: employeeId,
      jobCodeId: 'job-1',
      eventType: 'work',
      clockIn: '2026-06-04T12:00:00.000Z',
      clockOut: '2026-06-04T16:00:00.000Z',
      notes: 'Admin correction',
      createdBy: adminProfileRow.id,
    })).rejects.toThrow('Choose an active job code.');
  });

  it('rejects manual break entries that are not covered by an existing work entry', async () => {
    const { service, orFilters } = createFakeClient({
      profile: adminProfileRow,
      manualBreakWorkEntry: null,
    });

    await expect(service.createManualEntry({
      userId: employeeId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: '2026-06-04T15:50:00.000Z',
      clockOut: '2026-06-04T16:22:00.000Z',
      notes: 'Break',
      createdBy: adminProfileRow.id,
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');
    expect(orFilters).toContain('clock_out.is.null,clock_out.gt.2026-06-04T15:50:00.000Z');
  });

  it('rejects manual break entries covered only by another employee work entry', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      manualBreakWorkEntry: timeEntryRow({
        id: 'other-employee-work',
        user_id: 'employee-2',
        clock_in: '2026-06-04T12:19:00.000Z',
        clock_out: null,
      }),
    });

    await expect(service.createManualEntry({
      userId: employeeId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: '2026-06-04T15:50:00.000Z',
      clockOut: '2026-06-04T16:22:00.000Z',
      notes: 'Break',
      createdBy: adminProfileRow.id,
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');
  });

  it('allows manual break entries whose start is inside an existing open work entry even when the break ends later', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      manualBreakWorkEntry: timeEntryRow({
        id: 'open-work',
        clock_in: '2026-06-04T12:19:00.000Z',
        clock_out: null,
      }),
    });

    const entry = await service.createManualEntry({
      userId: employeeId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: '2026-06-04T15:50:00.000Z',
      clockOut: '2026-06-04T23:22:00.000Z',
      notes: 'Break',
      createdBy: adminProfileRow.id,
    });

    expect(entry.id).toBe('manual-entry');
    expect(entry.eventType).toBe('break');
    expect(entry.jobCodeId).toBeNull();
  });

  it('allows manual break entries when only the break start is inside the matching closed work entry', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      manualBreakWorkEntry: timeEntryRow({
        id: 'closed-work',
        clock_in: '2026-06-04T12:00:00.000Z',
        clock_out: '2026-06-04T16:00:00.000Z',
      }),
    });

    const entry = await service.createManualEntry({
      userId: employeeId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: '2026-06-04T15:50:00.000Z',
      clockOut: '2026-06-04T16:22:00.000Z',
      notes: 'Break',
      createdBy: adminProfileRow.id,
    });

    expect(entry.id).toBe('manual-entry');
  });

  it('rejects manual break entries that start exactly at the closed work clock-out', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      manualBreakWorkEntry: timeEntryRow({
        id: 'closed-work',
        clock_in: '2026-06-04T12:00:00.000Z',
        clock_out: '2026-06-04T15:50:00.000Z',
      }),
    });

    await expect(service.createManualEntry({
      userId: employeeId,
      jobCodeId: null,
      eventType: 'break',
      clockIn: '2026-06-04T15:50:00.000Z',
      clockOut: '2026-06-04T16:22:00.000Z',
      notes: 'Break',
      createdBy: adminProfileRow.id,
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');
  });

  it('rejects editing an existing break start outside of a work entry', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      existingTimeEntry: timeEntryRow({
        id: 'break-entry',
        event_type: 'break',
        job_code_id: null,
        clock_in: '2026-06-04T15:50:00.000Z',
        clock_out: '2026-06-04T16:22:00.000Z',
      }),
      manualBreakWorkEntry: null,
    });

    await expect(service.updateTimeEntry({
      entryId: 'break-entry',
      patch: { clockIn: '2026-06-04T15:50:00.000Z' },
      editedBy: adminProfileRow.id,
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');
  });

  it('rejects editing existing break notes when its start is outside of a work entry', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      existingTimeEntry: timeEntryRow({
        id: 'break-entry',
        event_type: 'break',
        job_code_id: null,
        clock_in: '2026-06-04T15:50:00.000Z',
        clock_out: '2026-06-04T16:22:00.000Z',
      }),
      manualBreakWorkEntry: null,
    });

    await expect(service.updateTimeEntry({
      entryId: 'break-entry',
      patch: { notes: 'Admin note edit' },
      editedBy: adminProfileRow.id,
    })).rejects.toThrow('Manual break entries must start within an existing work entry for the employee.');
  });

  it('rejects moving an existing work entry onto an inactive or archived job code', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      jobCodeRow: { ...activeJobCodeRow, is_archived: true },
    });

    await expect(service.updateTimeEntry({
      entryId: 'entry-1',
      patch: { jobCodeId: 'job-2' },
      editedBy: adminProfileRow.id,
    })).rejects.toThrow('Choose an active job code.');
  });

  it('allows editing historical work entries that already reference an archived job code', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      existingTimeEntry: timeEntryRow({ job_code_id: 'archived-job' }),
      jobCodeRow: { ...activeJobCodeRow, id: 'archived-job', is_archived: true },
    });

    const entry = await service.updateTimeEntry({
      entryId: 'entry-1',
      patch: { jobCodeId: 'archived-job', notes: 'Corrected note' },
      editedBy: adminProfileRow.id,
    });

    expect(entry.notes).toBe('Corrected note');
  });

  it('requires delete readback so missing time entries are not silent no-ops', async () => {
    const { service } = createFakeClient({
      profile: adminProfileRow,
      existingTimeEntry: null,
    });

    await expect(service.deleteTimeEntry({ entryId: 'missing-entry' })).rejects.toThrow('No rows found');
  });
});
