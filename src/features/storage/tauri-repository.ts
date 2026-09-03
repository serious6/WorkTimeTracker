import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { absenceAuditSchema, absenceSchema } from '@/features/absences/absence-schema'
import { auditLogEntrySchema, timeEntryAuditSchema } from '@/features/audit/audit-schema'
import { securityAuditSchema } from '@/features/audit/security-audit-schema'
import { authUserSchema } from '@/features/auth/auth-schema'
import { projectBudgetSchema } from '@/features/budgets/budget-schema'
import {
  overtimeAuditSchema,
  overtimeEntrySchema,
} from '@/features/overtime/overtime-schema'
import { projectSchema } from '@/features/projects/project-schema'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'
import { timeEntrySchema } from '@/features/time-entries/time-entry-schema'
import { toAppError } from '@/lib/errors'
import type { Repository } from './repository'

const appVersionSchema = z.string().min(1).nullable()

/** Answer of `register` and `login`: the account and the id of the session. */
const signedInSchema = z.object({ user: authUserSchema, sessionId: z.string().min(1) })

/**
 * The backend keys its sessions by an opaque id instead of holding one ambient
 * session, so every command names the session it acts for. That id is a bearer
 * token for the whole command surface, therefore it stays in this module
 * variable and is written to no storage a page script can read — no
 * `sessionStorage`, `localStorage` or cookie. Reloading the window drops the
 * variable and returns to the login page; the abandoned backend session ends
 * with its idle timeout.
 */
let currentSessionId = ''

function rememberSession(id: string): void {
  currentSessionId = id
}

function forgetSession(): void {
  currentSessionId = ''
}

/** Rejected commands carry a serialized `AppError`, everything else is unexpected. */
async function run(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    return await invoke(command, { sessionId: currentSessionId, ...args })
  } catch (error) {
    throw toAppError(error) ?? (error instanceof Error ? error : new Error(String(error)))
  }
}

/** Starts a session and keeps its id for the following commands. */
async function signIn(command: string, credentials: unknown) {
  const { user, sessionId: id } = signedInSchema.parse(await run(command, { credentials }))
  rememberSession(id)
  return user
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
  register: (credentials) => signIn('register', credentials),
  login: (credentials) => signIn('login', credentials),
  logout: async () => {
    try {
      await run('logout')
    } finally {
      // The window gives its token up even when the command was rejected, so a
      // failed sign out never leaves a usable session behind in the frontend.
      forgetSession()
    }
  },
  listProjects: () => call('list_projects', {}, projectSchema.array()),
  createProject: (input) => call('create_project', { input }, projectSchema),
  updateProject: (id, input) => call('update_project', { id, input }, projectSchema),
  deleteProject: async (id) => {
    await run('delete_project', { id })
  },
  listTimeEntries: (range) => call('list_time_entries', { range }, timeEntrySchema.array()),
  createTimeEntry: (input) => call('create_time_entry', { input }, timeEntrySchema),
  updateTimeEntry: (id, input) => call('update_time_entry', { id, input }, timeEntrySchema),
  updateTimeEntryNote: (id, note) => call('update_time_entry_note', { id, note }, timeEntrySchema),
  switchRunningTimeEntry: (id, input) =>
    call('switch_running_time_entry', { id, input }, timeEntrySchema),
  deleteTimeEntry: async (id) => {
    await run('delete_time_entry', { id })
  },
  listTimeEntryAudits: (range) =>
    call('list_time_entry_audits', { range }, timeEntryAuditSchema.array()),
  listAuditLog: (range) => call('list_audit_log', { range }, auditLogEntrySchema.array()),
  listProjectBudgets: () => call('list_project_budgets', {}, projectBudgetSchema.array()),
  createProjectBudget: (input) => call('create_project_budget', { input }, projectBudgetSchema),
  updateProjectBudget: (id, input) =>
    call('update_project_budget', { id, input }, projectBudgetSchema),
  deleteProjectBudget: async (id) => {
    await run('delete_project_budget', { id })
  },
  listAbsences: (range) => call('list_absences', { range }, absenceSchema.array()),
  createAbsence: (input) => call('create_absence', { input }, absenceSchema),
  updateAbsence: (id, input) => call('update_absence', { id, input }, absenceSchema),
  saveAbsences: (inputs, replacementIds, updateId) =>
    call('save_absences', { inputs, replacementIds, updateId }, absenceSchema.array()),
  deleteAbsence: async (id) => {
    await run('delete_absence', { id })
  },
  listAbsenceAudits: (range) => call('list_absence_audits', { range }, absenceAuditSchema.array()),
  listOvertimeEntries: () => call('list_overtime_entries', {}, overtimeEntrySchema.array()),
  createOvertimeEntry: (input) => call('create_overtime_entry', { input }, overtimeEntrySchema),
  updateOvertimeEntry: (id, input) =>
    call('update_overtime_entry', { id, input }, overtimeEntrySchema),
  deleteOvertimeEntry: async (id) => {
    await run('delete_overtime_entry', { id })
  },
  listSecurityAudits: (range) =>
    call('list_security_audits', { range }, securityAuditSchema.array()),
  listOvertimeAudits: (range) =>
    call('list_overtime_audits', { range }, overtimeAuditSchema.array()),
  getWorkSettings: () => call('get_work_settings', {}, workSettingsSchema),
  updateWorkSettings: (settings) => call('update_work_settings', { settings }, workSettingsSchema),
  getAppVersion: () => call('get_app_version', {}, appVersionSchema),
}
