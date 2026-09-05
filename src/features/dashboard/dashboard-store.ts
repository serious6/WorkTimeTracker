import { create } from 'zustand'
import { addDays, fromDateKey, isFutureDay, toDateKey } from '@/lib/date'

type DashboardState = {
  /** Selected day as `YYYY-MM-DD`, never after today. */
  selectedDate: string
  setSelectedDate: (dateKey: string) => void
  shiftSelectedDate: (days: number) => void
  goToToday: () => void
}

/**
 * Days that have not happened yet carry no working time, so the selection stops
 * at today: a later day snaps back instead of being tracked or corrected.
 */
function boundedDateKey(dateKey: string): string {
  return isFutureDay(dateKey) ? toDateKey(new Date()) : dateKey
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedDate: toDateKey(new Date()),
  setSelectedDate: (selectedDate) => set({ selectedDate: boundedDateKey(selectedDate) }),
  shiftSelectedDate: (days) =>
    set((state) => ({
      selectedDate: boundedDateKey(toDateKey(addDays(fromDateKey(state.selectedDate), days))),
    })),
  goToToday: () => set({ selectedDate: toDateKey(new Date()) }),
}))

export function useSelectedDate(): Date {
  return fromDateKey(useDashboardStore((state) => state.selectedDate))
}
