import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { absenceAuditSchema, absenceSchema } from '@/features/absences/absence-schema'
import { auditLogEntrySchema } from '@/features/audit/audit-schema'
import { authUserSchema } from '@/features/auth/auth-schema'
import { projectBudgetSchema } from '@/features/budgets/budget-schema'
import { projectSchema } from '@/features/projects/project-schema'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'
import { timeEntryAuditSchema } from '@/features/time-entries/audit-schema'
import { timeEntrySchema } from '@/features/time-entries/time-entry-schema'
import { toAppError } from '@/lib/errors'
import type { Repository } from './repository'

const appVersionSchema = z.string().min(1).nullable()

/** Rejected commands carry a serialized `AppError`, everything else is unexpected. */
async function run(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    return await invoke(command, args)
  } catch (error) {
    throw toAppError(error) ?? (error instanceof Error ? error : new Error(String(error)))
  }
}

async function call<Schema extends z.ZodType>(
  command: string,
  args: Record<string, unknown>,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(await run(command, args))
}

export const tauriRepository: Repository = {
  currentSession: () => call('current_session', {}, authUserSchema.nullable()),
  register: (credentials) => call('register', { credentials }, authUserSchema),
  login: (credentials) => call('login', { credentials }, authUserSchema),
  logout: async () => {
    await run('logout')
  },
  listProjects: () => call('list_projects', {}, projectSchema.array()),
  createProject: (input) => call('create_project', { input }, projectSchema),
  updateProject: (id, input) => call('update_project', { id, input }, projectSchema),
  deleteProject: async (id) => {
    await run('delete_project', { id })
  },
  listTimeEntries: () => call('list_time_entries', {}, timeEntrySchema.array()),
  createTimeEntry: (input) => call('create_time_entry', { input }, timeEntrySchema),
  updateTimeEntry: (id, input) => call('update_time_entry', { id, input }, timeEntrySchema),
  updateTimeEntryNote: (id, note) => call('update_time_entry_note', { id, note }, timeEntrySchema),
  switchRunningTimeEntry: (id, input) =>
    call('switch_running_time_entry', { id, input }, timeEntrySchema),
  deleteTimeEntry: async (id) => {
    await run('delete_time_entry', { id })
  },
  listTimeEntryAudits: () =>
    call('list_time_entry_audits', {}, timeEntryAuditSchema.array()),
  listAuditLog: () => call('list_audit_log', {}, auditLogEntrySchema.array()),
  listProjectBudgets: () => call('list_project_budgets', {}, projectBudgetSchema.array()),
  createProjectBudget: (input) => call('create_project_budget', { input }, projectBudgetSchema),
  updateProjectBudget: (id, input) =>
    call('update_project_budget', { id, input }, projectBudgetSchema),
  deleteProjectBudget: async (id) => {
    await run('delete_project_budget', { id })
  },
  listAbsences: () => call('list_absences', {}, absenceSchema.array()),
  createAbsence: (input) => call('create_absence', { input }, absenceSchema),
  updateAbsence: (id, input) => call('update_absence', { id, input }, absenceSchema),
  deleteAbsence: async (id) => {
    await run('delete_absence', { id })
  },
  listAbsenceAudits: () => call('list_absence_audits', {}, absenceAuditSchema.array()),
  getWorkSettings: () => call('get_work_settings', {}, workSettingsSchema),
  updateWorkSettings: (settings) => call('update_work_settings', { settings }, workSettingsSchema),
  getAppVersion: () => call('get_app_version', {}, appVersionSchema),
}
