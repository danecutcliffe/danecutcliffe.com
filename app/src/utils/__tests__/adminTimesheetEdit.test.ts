import { describe, expect, it } from 'vitest';

import { resolveEditedClockOutForSave } from '../../components/AdminTimesheets';
import { parseAtlanticDateTimeInput } from '../time';

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
});
