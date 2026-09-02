import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TimerSession = {
  projectId: number | null
  /** Tracked time of the already closed segments of the session, in milliseconds. */
  carriedMs: number
  /**
   * Ids of the entries that belong to the session, so stopping can round the
   * whole session and not just the running segment. Sessions that were stored
   * before the ids were tracked carry none.
   */
  segmentIds?: number[]
  paused: boolean
}

/** Adds an entry to the session segments, keeping the order and each id once. */
export function withSegment(segmentIds: number[] | undefined, id: number): number[] {
  const ids = segmentIds ?? []
  return ids.includes(id) ? ids : [...ids, id]
}

type TimerState = {
  session: TimerSession | null
  /** Whether the persisted session has been reconciled with the stored entries. */
  recovered: boolean
  setSession: (session: TimerSession | null) => void
  recover: (session: TimerSession | null) => void
}

/**
 * Only the session bookkeeping lives in the client. A running timer is the time
 * entry without an end time, so it survives restarts and system sleep.
 */
export const useTimerStore = create<TimerState>()(
  persist(
    (set) => ({
      session: null,
      recovered: false,
      setSession: (session) => set({ session }),
      recover: (session) => set({ session, recovered: true }),
    }),
    {
      name: 'work-time-tracker.timer',
      partialize: ({ session }) => ({ session }),
    },
  ),
)
