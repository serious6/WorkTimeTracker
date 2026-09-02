import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { withSegment, type TimerSession } from './timer-store'

/**
 * Aligns the persisted session with the stored entries after a restart, a crash
 * or a system sleep. The database is the source of truth: an entry without an
 * end time is still running, and a session without such an entry is stale
 * unless it was paused.
 */
export function reconcileSession(
  session: TimerSession | null,
  running: TimeEntry | undefined,
): TimerSession | null {
  if (!running) return session?.paused ? session : null
  const sameProject = session?.projectId === running.projectId
  if (session && !session.paused && sameProject) return session
  return {
    projectId: running.projectId,
    carriedMs: sameProject ? (session?.carriedMs ?? 0) : 0,
    segmentIds: sameProject ? withSegment(session?.segmentIds, running.id) : [running.id],
    paused: false,
  }
}
