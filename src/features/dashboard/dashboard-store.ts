import { create } from 'zustand'
import { addDays, fromDateKey, toDateKey } from '@/lib/date'

type DashboardState = {
  /** Selected day as `YYYY-MM-DD`. */
  selectedDate: string
  setSelectedDate: (dateKey: string) => void
  shiftSelectedDate: (days: number) => void
  goToToday: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedDate: toDateKey(new Date()),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  shiftSelectedDate: (days) =>
    set((state) => ({ selectedDate: toDateKey(addDays(fromDateKey(state.selectedDate), days)) })),
  goToToday: () => set({ selectedDate: toDateKey(new Date()) }),
}))

export function useSelectedDate(): Date {
  return fromDateKey(useDashboardStore((state) => state.selectedDate))
}
