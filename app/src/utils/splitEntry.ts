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
