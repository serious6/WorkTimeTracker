import { create } from 'zustand'

export type View = 'dashboard' | 'projects' | 'time-entries' | 'reports' | 'calendar' | 'settings'

type NavigationState = {
  view: View
  projectFilter: number | null
  navigate: (view: View, options?: { projectFilter?: number | null }) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  view: 'dashboard',
  projectFilter: null,
  navigate: (view, options) => set({ view, projectFilter: options?.projectFilter ?? null }),
}))
