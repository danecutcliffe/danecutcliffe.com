import { describe, expect, it } from 'vitest';

import { buildEntryEditorPatch, resolveEditedClockOutForSave } from '../../components/AdminTimesheets';
import type { TimeEntry } from '../../domain/types';
import { formatAtlanticDateTimeInput, parseAtlanticDateTimeInput } from '../time';

const openEntry: TimeEntry = {
  id: 'entry-open',
  userId: 'employee-1',
  jobCodeId: 'job-1',
  eventType: 'work',
  clockIn: '2026-07-10T18:43:37.456Z',
  clockOut: null,
  clockInLat: 46.24,
  clockInLng: -63.12,
  clockOutLat: null,
  clockOutLng: null,
  notes: 'Original note',
  isAutoClockedOut: false,
  createdBy: 'employee-1',
  createdAt: '2026-07-10T18:43:37.456Z',
};

describe('admin timesheet edit helpers', () => {
  it('preserves an existing punch out when the replacement time is blank', () => {
    const existingClockOut = '2026-06-11T18:42:00.000Z';

    expect(resolveEditedClockOutForSave('', existingClockOut)).toBe(existingClockOut);
  });

  it('keeps already-open entries open when punch out time is blank', () => {
    expect(resolveEditedClockOutForSave('', null)).toBeNull();
  });

  it('uses a complete replacement punch out when date and time are provided', () => {
    const replacement = '2026-06-11T15:42';

    expect(resolveEditedClockOutForSave(replacement, '2026-06-11T18:42:00.000Z')).toBe(parseAtlanticDateTimeInput(replacement));
  });

  it('submits only a changed job code and preserves exact open-punch data', () => {
    expect(buildEntryEditorPatch({
      entry: openEntry,
      jobCodeId: 'job-2',
      clockIn: formatAtlanticDateTimeInput(openEntry.clockIn),
      clockOut: '',
      notes: openEntry.notes ?? '',
    })).toEqual({ jobCodeId: 'job-2' });
  });

  it('does not round adjacent closed-entry timestamps during a job correction', () => {
    const adjacentEntry: TimeEntry = {
      ...openEntry,
      id: 'entry-adjacent',
      clockIn: '2026-07-10T13:15:45.000Z',
      clockOut: '2026-07-10T15:30:20.000Z',
    };

    expect(buildEntryEditorPatch({
      entry: adjacentEntry,
      jobCodeId: 'job-2',
      clockIn: formatAtlanticDateTimeInput(adjacentEntry.clockIn),
      clockOut: formatAtlanticDateTimeInput(adjacentEntry.clockOut as string),
      notes: adjacentEntry.notes ?? '',
    })).toEqual({ jobCodeId: 'job-2' });
  });

  it('does not reopen a closed entry when its punch out draft is blank', () => {
    const closedEntry: TimeEntry = {
      ...openEntry,
      id: 'entry-closed',
      clockOut: '2026-07-10T20:30:20.000Z',
    };

    expect(buildEntryEditorPatch({
      entry: closedEntry,
      jobCodeId: closedEntry.jobCodeId ?? '',
      clockIn: formatAtlanticDateTimeInput(closedEntry.clockIn),
      clockOut: '',
      notes: closedEntry.notes ?? '',
    })).toEqual({});
  });

  it('includes only fields the admin actually changes', () => {
    const replacementClockIn = '2026-07-10T15:00';

    expect(buildEntryEditorPatch({
      entry: openEntry,
      jobCodeId: openEntry.jobCodeId ?? '',
      clockIn: replacementClockIn,
      clockOut: '',
      notes: 'Corrected note',
    })).toEqual({
      clockIn: parseAtlanticDateTimeInput(replacementClockIn),
      notes: 'Corrected note',
    });
  });
});
