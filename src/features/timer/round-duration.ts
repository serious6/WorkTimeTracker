import { MINUTE_MS, startOfDay } from '@/lib/date'

export const DISCARDED_ENTRY_TITLE = 'Timer discarded'
export const DISCARDED_ENTRY_MESSAGE = 'Sessions shorter than 30 seconds are not saved'

/** The most that rounding half up can add to a session. */
export const MAX_ROUNDING_MS = MINUTE_MS / 2

/**
 * Whole minutes of a tracked session. The seconds part is rounded half up, so a
 * session of less than 30 seconds becomes zero minutes and is discarded.
 */
export function roundToMinutes(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.round(elapsedMs / MINUTE_MS)
}

/**
 * Where a segment of `keptMs` begins once the session was rounded. Rounding up
 * would end the segment after `stoppedAt`, and time that is booked ahead of the
 * clock blocks the next session, so the segment grows into the past instead: at
 * most back to `freeSinceMs`, the moment the time before it is free, and never
 * across midnight, which would move tracked time into another day.
 */
export function roundedStart(
  startMs: number,
  keptMs: number,
  stoppedAt: number,
  freeSinceMs: number,
): number {
  if (startMs + keptMs <= stoppedAt) return startMs
  return Math.max(freeSinceMs, startOfDay(new Date(startMs)).getTime(), stoppedAt - keptMs)
}
