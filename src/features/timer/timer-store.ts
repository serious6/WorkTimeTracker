import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TimerSession = {
  projectId: number
  /** Tracked time of the already closed segments of the session, in milliseconds. */
  carriedMs: number
  paused: boolean
}

type TimerState = {
  session: TimerSession | null
  setSession: (session: TimerSession | null) => void
}

/**
 * Only the session bookkeeping lives in the client. A running timer is the time
 * entry without an end time, so it survives restarts and system sleep.
 */
export const useTimerStore = create<TimerState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
    }),
    { name: 'work-time-tracker.timer' },
  ),
)
