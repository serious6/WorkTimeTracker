import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  | 'overtime'
  | 'calendar'
  | 'audit-trails'
  | 'settings'
  | 'licenses'

type NavigationState = {
  view: View
  projectFilter: number | null
  dateFilter: Date | null
  sidebarExpanded: boolean
  navigate: (view: View, options?: { projectFilter?: number | null; dateFilter?: Date | null }) => void
  setProjectFilter: (projectFilter: number | null) => void
  toggleSidebar: () => void
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      view: 'dashboard',
      projectFilter: null,
      dateFilter: null,
      sidebarExpanded: true,
      navigate: (view, options) =>
        set({
          view,
          projectFilter: options?.projectFilter ?? null,
          dateFilter: options?.dateFilter ?? null,
        }),
      setProjectFilter: (projectFilter) => set({ projectFilter }),
      toggleSidebar: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
    }),
    {
      name: 'work-time-tracker.navigation',
      partialize: ({ sidebarExpanded }) => ({ sidebarExpanded }),
    },
  ),
)
