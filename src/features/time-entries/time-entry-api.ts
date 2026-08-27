import { invoke, isTauri } from '@tauri-apps/api/core'
import {
  newTimeEntrySchema,
  timeEntrySchema,
  type NewTimeEntry,
  type TimeEntry,
} from './time-entry-schema'

export const timeEntryKeys = {
  all: ['time-entries'] as const,
}

export async function listTimeEntries(): Promise<TimeEntry[]> {
  if (!isTauri()) return []
  const entries = await invoke<unknown[]>('list_time_entries')
  return entries.map((entry) => timeEntrySchema.parse(entry))
}

export async function createTimeEntry(input: NewTimeEntry): Promise<TimeEntry> {
  const parsed = newTimeEntrySchema.parse(input)
  if (!isTauri()) {
    const endedAt = new Date()
    const startedAt = new Date(endedAt.getTime() - parsed.durationMinutes * 60_000)
    return timeEntrySchema.parse({
      ...parsed,
      id: Date.now(),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    })
  }
  return timeEntrySchema.parse(await invoke('create_time_entry', { input: parsed }))
}
