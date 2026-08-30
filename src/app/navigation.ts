import { create } from 'zustand'

export type View =
  | 'dashboard'
  | 'week'
  | 'projects'
  | 'time-entries'
  | 'time-management'
  | 'budgets'
  | 'reports'
  | 'working-time'
  | 'absences'
  | 'calendar'
  | 'settings'
  | 'licenses'

type NavigationState = {
  view: View
  projectFilter: number | null
  dateFilter: Date | null
  navigate: (view: View, options?: { projectFilter?: number | null; dateFilter?: Date | null }) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  view: 'dashboard',
  projectFilter: null,
  dateFilter: null,
  navigate: (view, options) =>
    set({
      view,
      projectFilter: options?.projectFilter ?? null,
      dateFilter: options?.dateFilter ?? null,
    }),
}))
