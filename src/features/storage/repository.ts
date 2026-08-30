import type { AuthUser, Credentials } from '@/features/auth/auth-schema'
import type { ProjectBudget, SaveProjectBudget } from '@/features/budgets/budget-schema'
import type { Project, SaveProject } from '@/features/projects/project-schema'
import type { SaveWorkSettings, WorkSettings } from '@/features/settings/work-settings-schema'
import type { TimeEntryAudit } from '@/features/time-entries/audit-schema'
import type { SaveTimeEntry, TimeEntry } from '@/features/time-entries/time-entry-schema'

export type Repository = {
  currentSession: () => Promise<AuthUser | null>
  register: (credentials: Credentials) => Promise<AuthUser>
  login: (credentials: Credentials) => Promise<AuthUser>
  logout: () => Promise<void>
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
  listTimeEntryAudits: () => Promise<TimeEntryAudit[]>
  listProjectBudgets: () => Promise<ProjectBudget[]>
  createProjectBudget: (input: SaveProjectBudget) => Promise<ProjectBudget>
  updateProjectBudget: (id: number, input: SaveProjectBudget) => Promise<ProjectBudget>
  deleteProjectBudget: (id: number) => Promise<void>
  getWorkSettings: () => Promise<WorkSettings>
  updateWorkSettings: (settings: SaveWorkSettings) => Promise<WorkSettings>
  getAppVersion: () => Promise<string | null>
}
