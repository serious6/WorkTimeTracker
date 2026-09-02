import { MINUTE_MS } from '@/lib/date'

export const DISCARDED_ENTRY_TITLE = 'Timer discarded'
export const DISCARDED_ENTRY_MESSAGE = 'Sessions shorter than 30 seconds are not saved'

/**
 * Whole minutes of a tracked session. The seconds part is rounded half up, so a
 * session of less than 30 seconds becomes zero minutes and is discarded.
 */
export function roundToMinutes(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.round(elapsedMs / MINUTE_MS)
}
