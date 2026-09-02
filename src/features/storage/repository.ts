import type { Absence, AbsenceAudit, SaveAbsence } from '@/features/absences/absence-schema'
import type { AuthUser, Credentials } from '@/features/auth/auth-schema'
import type { AuditLogEntry, TimeEntryAudit } from '@/features/audit/audit-schema'
import type { ProjectBudget, SaveProjectBudget } from '@/features/budgets/budget-schema'
import type {
  OvertimeAudit,
  OvertimeEntry,
  SaveOvertimeEntry,
} from '@/features/overtime/overtime-schema'
import type { Project, SaveProject } from '@/features/projects/project-schema'
import type { SaveWorkSettings, WorkSettings } from '@/features/settings/work-settings-schema'
import type { SaveTimeEntry, TimeEntry } from '@/features/time-entries/time-entry-schema'
import type { ListRange } from './list-range'

export type Repository = {
  currentSession: () => Promise<AuthUser | null>
  register: (credentials: Credentials) => Promise<AuthUser>
  login: (credentials: Credentials) => Promise<AuthUser>
  logout: () => Promise<void>
  listProjects: () => Promise<Project[]>
  createProject: (input: SaveProject) => Promise<Project>
  updateProject: (id: number, input: SaveProject) => Promise<Project>
  deleteProject: (id: number) => Promise<void>
  listTimeEntries: (range?: ListRange) => Promise<TimeEntry[]>
  createTimeEntry: (input: SaveTimeEntry) => Promise<TimeEntry>
  updateTimeEntry: (id: number, input: SaveTimeEntry) => Promise<TimeEntry>
  updateTimeEntryNote: (id: number, note: string | null) => Promise<TimeEntry>
  switchRunningTimeEntry: (id: number, input: SaveTimeEntry) => Promise<TimeEntry>
  deleteTimeEntry: (id: number) => Promise<void>
  listTimeEntryAudits: (range?: ListRange) => Promise<TimeEntryAudit[]>
  listAuditLog: (range?: ListRange) => Promise<AuditLogEntry[]>
  listProjectBudgets: () => Promise<ProjectBudget[]>
  createProjectBudget: (input: SaveProjectBudget) => Promise<ProjectBudget>
  updateProjectBudget: (id: number, input: SaveProjectBudget) => Promise<ProjectBudget>
  deleteProjectBudget: (id: number) => Promise<void>
  listAbsences: (range?: ListRange) => Promise<Absence[]>
  createAbsence: (input: SaveAbsence) => Promise<Absence>
  updateAbsence: (id: number, input: SaveAbsence) => Promise<Absence>
  saveAbsences: (
    inputs: SaveAbsence[],
    replacementIds: number[],
    updateId?: number,
  ) => Promise<Absence[]>
  deleteAbsence: (id: number) => Promise<void>
  listAbsenceAudits: () => Promise<AbsenceAudit[]>
  listOvertimeEntries: () => Promise<OvertimeEntry[]>
  createOvertimeEntry: (input: SaveOvertimeEntry) => Promise<OvertimeEntry>
  updateOvertimeEntry: (id: number, input: SaveOvertimeEntry) => Promise<OvertimeEntry>
  deleteOvertimeEntry: (id: number) => Promise<void>
  listOvertimeAudits: () => Promise<OvertimeAudit[]>
  getWorkSettings: () => Promise<WorkSettings>
  updateWorkSettings: (settings: SaveWorkSettings) => Promise<WorkSettings>
  getAppVersion: () => Promise<string | null>
}
