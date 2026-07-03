import type { TimeEntry } from '../domain/types';
import { addDaysToDateKey, getAtlanticDateKey, parseAtlanticDateTimeInput } from './time';

export interface SplitDividerDraft {
  /** Atlantic wall-clock time (HH:MM) where the next segment starts. */
  time: string;
  /** Job code for the segment that starts at this divider. */
  jobCodeId: string;
}

export interface SplitSegment {
  clockIn: string;
  clockOut: string;
  jobCodeId: string;
}

export type SplitPlanResult =
  | { ok: true; segments: SplitSegment[] }
  | { ok: false; error: string };

/**
 * Turns an entry plus a list of divider times into contiguous segments that
 * tile the original punch exactly. Divider times are Atlantic wall-clock times
 * on the punch-in date; a time earlier than the previous boundary rolls to the
 * next day so overnight shifts split correctly.
 */
export function buildSplitPlan(params: {
  clockIn: string;
  clockOut: string;
  firstJobCodeId: string;
  dividers: SplitDividerDraft[];
}): SplitPlanResult {
  const { clockIn, clockOut, firstJobCodeId, dividers } = params;
  const startMs = new Date(clockIn).getTime();
  const endMs = new Date(clockOut).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, error: 'Only completed entries can be split.' };
  }
  if (!firstJobCodeId) return { ok: false, error: 'Every segment needs a job code.' };
  if (!dividers.length) return { ok: false, error: 'Add at least one split.' };

  const dateKey = getAtlanticDateKey(clockIn);
  const boundaries: Array<{ iso: string; ms: number; jobCodeId: string }> = [];
  let previousMs = startMs;

  for (const divider of dividers) {
    const time = divider.time.slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Enter a time for every split.' };
    if (!divider.jobCodeId) return { ok: false, error: 'Every segment needs a job code.' };

    let iso = parseAtlanticDateTimeInput(`${dateKey}T${time}`);
    let ms = new Date(iso).getTime();
    if (ms <= previousMs) {
      iso = parseAtlanticDateTimeInput(`${addDaysToDateKey(dateKey, 1)}T${time}`);
      ms = new Date(iso).getTime();
    }
    if (ms <= previousMs) return { ok: false, error: 'Split times must be in order.' };
    if (ms >= endMs) return { ok: false, error: 'Split times must be between punch in and punch out.' };

    boundaries.push({ iso, ms, jobCodeId: divider.jobCodeId });
    previousMs = ms;
  }

  const segments: SplitSegment[] = [];
  let segmentStart = clockIn;
  let segmentJobCodeId = firstJobCodeId;
  for (const boundary of boundaries) {
    segments.push({ clockIn: segmentStart, clockOut: boundary.iso, jobCodeId: segmentJobCodeId });
    segmentStart = boundary.iso;
    segmentJobCodeId = boundary.jobCodeId;
  }
  segments.push({ clockIn: segmentStart, clockOut, jobCodeId: segmentJobCodeId });

  return { ok: true, segments };
}

export type SplitSavePlan =
  | {
      ok: true;
      /** Index of the segment the original entry keeps (contains all punched break starts). */
      restIndex: number;
      /** Patches applied to the original entry, in order, before any creates. */
      updates: Array<Partial<Pick<TimeEntry, 'clockIn' | 'clockOut' | 'jobCodeId'>>>;
      /** Segments created as new closed entries after the original is reshaped. */
      creates: SplitSegment[];
    }
  | { ok: false; error: string };

/**
 * Orders the writes so every intermediate state satisfies the database rules:
 * no overlapping closed work entries, no work change may orphan a punched
 * break, and at most one open work entry per user (so nothing is ever created
 * open). The original entry is first shrunk onto the one segment that contains
 * every punched break start, then the vacated ranges are filled with new
 * closed entries. If breaks start inside two different segments, no legal
 * sequence exists without touching the break records, so the split is refused.
 */
export function buildSplitSavePlan(segments: SplitSegment[], breakEntries: TimeEntry[]): SplitSavePlan {
  if (segments.length < 2) return { ok: false, error: 'Add at least one split.' };
  const rangeStart = new Date(segments[0].clockIn).getTime();
  const rangeEnd = new Date(segments[segments.length - 1].clockOut).getTime();
  const segmentIndexes = new Set<number>();
  for (const breakEntry of breakEntries) {
    if (breakEntry.eventType !== 'break') continue;
    const breakStart = new Date(breakEntry.clockIn).getTime();
    if (breakStart < rangeStart || breakStart >= rangeEnd) continue;
    segmentIndexes.add(segments.findIndex((segment) => breakStart >= new Date(segment.clockIn).getTime() && breakStart < new Date(segment.clockOut).getTime()));
  }
  if (segmentIndexes.size > 1) {
    return { ok: false, error: 'Punched breaks fall inside more than one of these segments, so the day cannot be split in one pass. Adjust or delete the breaks first, split the entry, then re-add the breaks.' };
  }
  const restIndex = segmentIndexes.size === 1 ? [...segmentIndexes][0] : 0;

  const updates: Array<Partial<Pick<TimeEntry, 'clockIn' | 'clockOut' | 'jobCodeId'>>> = [];
  if (restIndex > 0) updates.push({ clockIn: segments[restIndex].clockIn });
  if (restIndex < segments.length - 1) updates.push({ clockOut: segments[restIndex].clockOut });
  updates[updates.length - 1] = { ...updates[updates.length - 1], jobCodeId: segments[restIndex].jobCodeId };

  return { ok: true, restIndex, updates, creates: segments.filter((_, index) => index !== restIndex) };
}

/**
 * Breaks attach to work entries by time overlap, so a punched break that spans
 * a split boundary would straddle two segments after the split. Surface those
 * so the admin can double-check the result.
 */
export function findBreaksCrossingSplits(breakEntries: TimeEntry[], segments: SplitSegment[]): TimeEntry[] {
  const boundaryMs = segments.slice(1).map((segment) => new Date(segment.clockIn).getTime());
  return breakEntries.filter((entry) => {
    if (entry.eventType !== 'break' || !entry.clockOut) return false;
    const breakStart = new Date(entry.clockIn).getTime();
    const breakEnd = new Date(entry.clockOut).getTime();
    return boundaryMs.some((ms) => ms > breakStart && ms < breakEnd);
  });
}
