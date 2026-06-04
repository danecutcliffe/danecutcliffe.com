import { describe, expect, it, vi } from 'vitest';
import { SupabaseTimeClockService } from '../supabaseTimeClockService';
import type { ProfileRow, TimeEntryRow } from '../supabase/mappers';

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
  openWorkEntry = null,
  openBreakEntry = null,
  rpcResults = {},
}: {
  openWorkEntry?: TimeEntryRow | null;
  openBreakEntry?: TimeEntryRow | null;
  rpcResults?: Record<string, unknown>;
} = {}) {
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => ({
    data: rpcResults[name] ?? timeEntryRow({ id: `${name}-entry` }),
    error: null,
  }));

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: profileRow, error: null }),
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
        is: (column: string, value: unknown) => {
          filters.push({ column, value });
          return query;
        },
        maybeSingle: async () => {
          const eventType = filters.find((filter) => filter.column === 'event_type')?.value;
          const row = eventType === 'break' ? openBreakEntry : eventType === 'work' ? openWorkEntry : null;
          return { data: row, error: null };
        },
        insert: () => {
          throw new Error('Employee punch flow should not insert time_entries directly.');
        },
        update: () => {
          throw new Error('Employee punch flow should not update time_entries directly.');
        },
      };
      return query;
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
