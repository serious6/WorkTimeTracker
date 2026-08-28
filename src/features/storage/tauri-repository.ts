import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { authUserSchema } from '@/features/auth/auth-schema'
import { projectBudgetSchema } from '@/features/budgets/budget-schema'
import { projectSchema } from '@/features/projects/project-schema'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'
import { timeEntrySchema } from '@/features/time-entries/time-entry-schema'
import type { Repository } from './repository'

const appVersionSchema = z.string().min(1).nullable()

async function call<Schema extends z.ZodType>(
  command: string,
  args: Record<string, unknown>,
  schema: Schema,
): Promise<z.output<Schema>> {
  try {
    return schema.parse(await invoke(command, args))
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export const tauriRepository: Repository = {
  currentSession: () => call('current_session', {}, authUserSchema.nullable()),
  register: (credentials) => call('register', { credentials }, authUserSchema),
  login: (credentials) => call('login', { credentials }, authUserSchema),
  logout: async () => {
    await invoke('logout')
  },
  listProjects: () => call('list_projects', {}, projectSchema.array()),
  createProject: (input) => call('create_project', { input }, projectSchema),
  updateProject: (id, input) => call('update_project', { id, input }, projectSchema),
  deleteProject: async (id) => {
    await invoke('delete_project', { id })
  },
  listTimeEntries: () => call('list_time_entries', {}, timeEntrySchema.array()),
  createTimeEntry: (input) => call('create_time_entry', { input }, timeEntrySchema),
  updateTimeEntry: (id, input) => call('update_time_entry', { id, input }, timeEntrySchema),
  updateTimeEntryNote: (id, note) => call('update_time_entry_note', { id, note }, timeEntrySchema),
  switchRunningTimeEntry: (id, input) =>
    call('switch_running_time_entry', { id, input }, timeEntrySchema),
  deleteTimeEntry: async (id) => {
    await invoke('delete_time_entry', { id })
  },
  listProjectBudgets: () => call('list_project_budgets', {}, projectBudgetSchema.array()),
  createProjectBudget: (input) => call('create_project_budget', { input }, projectBudgetSchema),
  updateProjectBudget: (id, input) =>
    call('update_project_budget', { id, input }, projectBudgetSchema),
  deleteProjectBudget: async (id) => {
    await invoke('delete_project_budget', { id })
  },
  getWorkSettings: () => call('get_work_settings', {}, workSettingsSchema),
  updateWorkSettings: (settings) => call('update_work_settings', { settings }, workSettingsSchema),
  getAppVersion: () => call('get_app_version', {}, appVersionSchema),
}
