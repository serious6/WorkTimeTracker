import type { Project, SaveProject } from '@/features/projects/project-schema'
import type { WorkSettings } from '@/features/settings/work-settings-schema'
import type { SaveTimeEntry, TimeEntry } from '@/features/time-entries/time-entry-schema'

export type Repository = {
  listProjects: () => Promise<Project[]>
  createProject: (input: SaveProject) => Promise<Project>
  updateProject: (id: number, input: SaveProject) => Promise<Project>
  deleteProject: (id: number) => Promise<void>
  listTimeEntries: () => Promise<TimeEntry[]>
  createTimeEntry: (input: SaveTimeEntry) => Promise<TimeEntry>
  updateTimeEntry: (id: number, input: SaveTimeEntry) => Promise<TimeEntry>
  updateTimeEntryNote: (id: number, note: string | null) => Promise<TimeEntry>
  switchRunningTimeEntry: (id: number, input: SaveTimeEntry) => Promise<TimeEntry>
  deleteTimeEntry: (id: number) => Promise<void>
  getWorkSettings: () => Promise<WorkSettings>
  updateWorkSettings: (settings: WorkSettings) => Promise<WorkSettings>
}
