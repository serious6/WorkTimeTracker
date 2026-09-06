import { addDays, MINUTE_MS, startOfDay } from '@/lib/date'

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

/**
 * Where a segment of `keptMs` that begins at `keptStartMs` ends. The entry
 * before the segment can keep it from growing backwards, so rounding may reach
 * past `stoppedAt` and, close to midnight, into the day that follows. A day
 * that has not happened yet records no work, so the end stops at the last
 * millisecond of the day the timer was stopped in.
 */
export function roundedEnd(keptStartMs: number, keptMs: number, stoppedAt: number): number {
  const dayEndMs = startOfDay(addDays(new Date(stoppedAt), 1)).getTime() - 1
  return Math.min(keptStartMs + keptMs, dayEndMs)
}
