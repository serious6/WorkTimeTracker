import {
  DUPLICATE_BUDGET_MESSAGE,
  projectBudgetSchema,
  saveProjectBudgetSchema,
  type ProjectBudget,
} from '@/features/budgets/budget-schema'
import {
  projectSchema,
  saveProjectSchema,
  type Project,
  type SaveProject,
} from '@/features/projects/project-schema'
import {
  DEFAULT_WORK_SETTINGS,
  workSettingsSchema,
  type WorkSettings,
} from '@/features/settings/work-settings-schema'
import { findOverlap } from '@/features/time-entries/overlap'
import {
  OVERLAP_MESSAGE,
  saveTimeEntrySchema,
  timeEntrySchema,
  type SaveTimeEntry,
  type TimeEntry,
} from '@/features/time-entries/time-entry-schema'
import type { Repository } from './repository'

const PROJECTS_KEY = 'work-time-tracker.projects'
const ENTRIES_KEY = 'work-time-tracker.time-entries'
const BUDGETS_KEY = 'work-time-tracker.project-budgets'
const SETTINGS_KEY = 'work-time-tracker.work-settings'

function read<Value>(key: string, fallback: Value, parse: (value: unknown) => Value): Value {
  try {
    const stored = globalThis.localStorage?.getItem(key)
    return stored ? parse(JSON.parse(stored)) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  globalThis.localStorage?.setItem(key, JSON.stringify(value))
}

function readProjects(): Project[] {
  return read(PROJECTS_KEY, [], (value) => projectSchema.array().parse(value))
}

function readEntries(): TimeEntry[] {
  return read(ENTRIES_KEY, [], (value) => timeEntrySchema.array().parse(value))
}

function readBudgets(): ProjectBudget[] {
  return read(BUDGETS_KEY, [], (value) => projectBudgetSchema.array().parse(value))
}

function nextId(records: { id: number }[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.id), 0) + 1
}

/**
 * Browser fallback used for UI development and end-to-end tests. It mirrors the
 * behaviour of the Rust commands, including overlap rejection.
 */
export const localRepository: Repository = {
  listProjects: async () => readProjects().sort((left, right) => left.name.localeCompare(right.name)),
  createProject: async (input) => {
    const parsed = saveProjectSchema.parse(input)
    const projects = readProjects()
    const now = new Date().toISOString()
    const project = projectSchema.parse({
      ...parsed,
      id: nextId(projects),
      createdAt: now,
      updatedAt: now,
    })
    write(PROJECTS_KEY, [...projects, project])
    return project
  },
  updateProject: async (id, input) => {
    const parsed: SaveProject = saveProjectSchema.parse(input)
    const projects = readProjects()
    const current = projects.find((project) => project.id === id)
    if (!current) throw new Error('Project not found')
    const updated = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    write(
      PROJECTS_KEY,
      projects.map((project) => (project.id === id ? updated : project)),
    )
    return updated
  },
  deleteProject: async (id) => {
    write(
      PROJECTS_KEY,
      readProjects().filter((project) => project.id !== id),
    )
    write(
      BUDGETS_KEY,
      readBudgets().filter((budget) => budget.projectId !== id),
    )
    write(
      ENTRIES_KEY,
      readEntries().map((entry) => (entry.projectId === id ? { ...entry, projectId: null } : entry)),
    )
  },
  listTimeEntries: async () =>
    readEntries().sort((left, right) => left.startTime.localeCompare(right.startTime)),
  createTimeEntry: async (input) => {
    const parsed: SaveTimeEntry = saveTimeEntrySchema.parse(input)
    if (parsed.projectId === null) throw new Error('Project is required')
    const entries = readEntries()
    if (findOverlap(entries, parsed)) throw new Error(OVERLAP_MESSAGE)
    const now = new Date().toISOString()
    const entry = timeEntrySchema.parse({
      ...parsed,
      id: nextId(entries),
      createdAt: now,
      updatedAt: now,
    })
    write(ENTRIES_KEY, [...entries, entry])
    return entry
  },
  updateTimeEntry: async (id, input) => {
    const parsed: SaveTimeEntry = saveTimeEntrySchema.parse(input)
    const entries = readEntries()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new Error('Time entry not found')
    if (findOverlap(entries, parsed, id)) throw new Error(OVERLAP_MESSAGE)
    const updated = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    write(
      ENTRIES_KEY,
      entries.map((entry) => (entry.id === id ? updated : entry)),
    )
    return updated
  },
  updateTimeEntryNote: async (id, note) => {
    const entries = readEntries()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new Error('Time entry not found')
    const updated = timeEntrySchema.parse({
      ...current,
      note: note?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    write(
      ENTRIES_KEY,
      entries.map((entry) => (entry.id === id ? updated : entry)),
    )
    return updated
  },
  switchRunningTimeEntry: async (id, input) => {
    const parsed: SaveTimeEntry = saveTimeEntrySchema.parse(input)
    if (parsed.projectId === null || parsed.endTime !== null) throw new Error('Invalid timer switch')
    const entries = readEntries()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new Error('Time entry not found')
    if (current.endTime !== null) throw new Error('Timer is not running')
    if (parsed.startTime <= current.startTime) throw new Error('End time must be later than start time')
    const closed = timeEntrySchema.parse({
      ...current,
      endTime: parsed.startTime,
      updatedAt: new Date().toISOString(),
    })
    const nextEntries = entries.map((entry) => (entry.id === id ? closed : entry))
    if (findOverlap(nextEntries, parsed)) throw new Error(OVERLAP_MESSAGE)
    const now = new Date().toISOString()
    const created = timeEntrySchema.parse({
      ...parsed,
      id: nextId(entries),
      createdAt: now,
      updatedAt: now,
    })
    write(ENTRIES_KEY, [...nextEntries, created])
    return created
  },
  deleteTimeEntry: async (id) => {
    write(
      ENTRIES_KEY,
      readEntries().filter((entry) => entry.id !== id),
    )
  },
  listProjectBudgets: async () =>
    readBudgets().sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
  createProjectBudget: async (input) => {
    const parsed = saveProjectBudgetSchema.parse(input)
    const budgets = readBudgets()
    if (budgets.some((budget) => budget.projectId === parsed.projectId)) {
      throw new Error(DUPLICATE_BUDGET_MESSAGE)
    }
    const now = new Date().toISOString()
    const budget = projectBudgetSchema.parse({
      ...parsed,
      id: nextId(budgets),
      createdAt: now,
      updatedAt: now,
    })
    write(BUDGETS_KEY, [...budgets, budget])
    return budget
  },
  updateProjectBudget: async (id, input) => {
    const parsed = saveProjectBudgetSchema.parse(input)
    const budgets = readBudgets()
    const current = budgets.find((budget) => budget.id === id)
    if (!current) throw new Error('Budget not found')
    if (budgets.some((budget) => budget.projectId === parsed.projectId && budget.id !== id)) {
      throw new Error(DUPLICATE_BUDGET_MESSAGE)
    }
    const updated = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    write(
      BUDGETS_KEY,
      budgets.map((budget) => (budget.id === id ? updated : budget)),
    )
    return updated
  },
  deleteProjectBudget: async (id) => {
    write(
      BUDGETS_KEY,
      readBudgets().filter((budget) => budget.id !== id),
    )
  },
  getWorkSettings: async () =>
    read(SETTINGS_KEY, DEFAULT_WORK_SETTINGS, (value) => workSettingsSchema.parse(value)),
  updateWorkSettings: async (settings) => {
    const parsed: WorkSettings = workSettingsSchema.parse(settings)
    write(SETTINGS_KEY, parsed)
    return parsed
  },
  getAppVersion: async () => null,
}
