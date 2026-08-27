import { create } from 'zustand'

type TimerState = {
  startedAt: string | null
  start: () => void
  stop: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  startedAt: null,
  start: () => set({ startedAt: new Date().toISOString() }),
  stop: () => set({ startedAt: null }),
}))
