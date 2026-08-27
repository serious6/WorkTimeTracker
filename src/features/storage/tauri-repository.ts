import { invoke } from '@tauri-apps/api/core'
import type { z } from 'zod'
import { projectSchema } from '@/features/projects/project-schema'
import { workSettingsSchema } from '@/features/settings/work-settings-schema'
import { timeEntrySchema } from '@/features/time-entries/time-entry-schema'
import type { Repository } from './repository'

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
  listProjects: () => call('list_projects', {}, projectSchema.array()),
  createProject: (input) => call('create_project', { input }, projectSchema),
  updateProject: (id, input) => call('update_project', { id, input }, projectSchema),
  deleteProject: async (id) => {
    await invoke('delete_project', { id })
  },
  listTimeEntries: () => call('list_time_entries', {}, timeEntrySchema.array()),
  createTimeEntry: (input) => call('create_time_entry', { input }, timeEntrySchema),
  updateTimeEntry: (id, input) => call('update_time_entry', { id, input }, timeEntrySchema),
  deleteTimeEntry: async (id) => {
    await invoke('delete_time_entry', { id })
  },
  getWorkSettings: () => call('get_work_settings', {}, workSettingsSchema),
  updateWorkSettings: (settings) => call('update_work_settings', { settings }, workSettingsSchema),
}
