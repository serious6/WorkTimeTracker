import { z } from 'zod'
import {
  DUPLICATE_EMAIL_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  authUserSchema,
  registrationSchema,
  type AuthUser,
  type Credentials,
} from '@/features/auth/auth-schema'
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

const USERS_KEY = 'work-time-tracker.users'
const SCOPED_KEYS = ['projects', 'time-entries', 'project-budgets', 'work-settings'] as const

type ScopedKey = (typeof SCOPED_KEYS)[number]

export const NOT_SIGNED_IN_MESSAGE = 'Please sign in first'

const storedUserSchema = authUserSchema.extend({ passwordHash: z.string() })

type StoredUser = z.infer<typeof storedUserSchema>

const SESSION_KEY = 'work-time-tracker.session'

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

/** The session ends with the browsing session, so a restart asks for a login. */
function sessionUserId(): number | null {
  const stored = Number(globalThis.sessionStorage?.getItem(SESSION_KEY))
  return Number.isInteger(stored) && stored > 0 ? stored : null
}

function setSessionUserId(userId: number | null): void {
  if (userId === null) globalThis.sessionStorage?.removeItem(SESSION_KEY)
  else globalThis.sessionStorage?.setItem(SESSION_KEY, String(userId))
}

function requireUserId(): number {
  const userId = sessionUserId()
  if (userId === null) throw new Error(NOT_SIGNED_IN_MESSAGE)
  return userId
}

/** All records are stored below the key of their owner. */
function scopedKey(key: ScopedKey): string {
  return `work-time-tracker.${requireUserId()}.${key}`
}

function readUsers(): StoredUser[] {
  return read(USERS_KEY, [], (value) => storedUserSchema.array().parse(value))
}

function toAuthUser({ id, email, createdAt }: StoredUser): AuthUser {
  return { id, email, createdAt }
}

function readProjects(): Project[] {
  return read(scopedKey('projects'), [], (value) => projectSchema.array().parse(value))
}

function readEntries(): TimeEntry[] {
  return read(scopedKey('time-entries'), [], (value) => timeEntrySchema.array().parse(value))
}

function readBudgets(): ProjectBudget[] {
  return read(scopedKey('project-budgets'), [], (value) => projectBudgetSchema.array().parse(value))
}

function nextId(records: { id: number }[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.id), 0) + 1
}

const PBKDF2_ITERATIONS = 210_000

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

/** Passwords are stored as a salted PBKDF2 digest, never in plaintext. */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const digest = await derive(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${digest}`
}

function equals(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [scheme, iterations, salt, digest] = hash.split('$')
  if (scheme !== 'pbkdf2-sha256' || !salt || !digest) return false
  return equals(await derive(password, fromBase64(salt), Number(iterations)), digest)
}

/** Hands the data of the former single-user storage to the first user. */
function claimLegacyData(userId: number): void {
  for (const key of SCOPED_KEYS) {
    const legacy = globalThis.localStorage?.getItem(`work-time-tracker.${key}`)
    if (legacy === null || legacy === undefined) continue
    globalThis.localStorage?.setItem(`work-time-tracker.${userId}.${key}`, legacy)
    globalThis.localStorage?.removeItem(`work-time-tracker.${key}`)
  }
}

/**
 * Browser fallback used for UI development and end-to-end tests. It mirrors the
 * behaviour of the Rust commands, including overlap rejection.
 */
export const localRepository: Repository = {
  currentSession: async () => {
    const user = readUsers().find(({ id }) => id === sessionUserId())
    return user ? toAuthUser(user) : null
  },
  register: async (credentials: Credentials) => {
    const parsed = registrationSchema.safeParse(credentials)
    if (!parsed.success) {
      const emailError = parsed.error.issues.find((issue) => issue.path[0] === 'email')
      if (emailError) throw new Error(emailError.message)
      throw new Error(PASSWORD_POLICY_MESSAGE)
    }
    const { email, password } = parsed.data
    const users = readUsers()
    if (users.some((user) => user.email === email)) throw new Error(DUPLICATE_EMAIL_MESSAGE)
    const user: StoredUser = {
      id: nextId(users),
      email,
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
    }
    write(USERS_KEY, [...users, user])
    setSessionUserId(user.id)
    if (users.length === 0) claimLegacyData(user.id)
    return toAuthUser(user)
  },
  login: async (credentials: Credentials) => {
    const email = credentials.email.trim().toLowerCase()
    const user = readUsers().find((stored) => stored.email === email)
    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      throw new Error(INVALID_CREDENTIALS_MESSAGE)
    }
    setSessionUserId(user.id)
    return toAuthUser(user)
  },
  logout: async () => {
    setSessionUserId(null)
  },
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
    write(scopedKey('projects'), [...projects, project])
    return project
  },
  updateProject: async (id, input) => {
    const parsed: SaveProject = saveProjectSchema.parse(input)
    const projects = readProjects()
    const current = projects.find((project) => project.id === id)
    if (!current) throw new Error('Project not found')
    const updated = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    write(
      scopedKey('projects'),
      projects.map((project) => (project.id === id ? updated : project)),
    )
    return updated
  },
  deleteProject: async (id) => {
    write(
      scopedKey('projects'),
      readProjects().filter((project) => project.id !== id),
    )
    write(
      scopedKey('project-budgets'),
      readBudgets().filter((budget) => budget.projectId !== id),
    )
    write(
      scopedKey('time-entries'),
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
    write(scopedKey('time-entries'), [...entries, entry])
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
      scopedKey('time-entries'),
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
      scopedKey('time-entries'),
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
    write(scopedKey('time-entries'), [...nextEntries, created])
    return created
  },
  deleteTimeEntry: async (id) => {
    write(
      scopedKey('time-entries'),
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
    write(scopedKey('project-budgets'), [...budgets, budget])
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
      scopedKey('project-budgets'),
      budgets.map((budget) => (budget.id === id ? updated : budget)),
    )
    return updated
  },
  deleteProjectBudget: async (id) => {
    write(
      scopedKey('project-budgets'),
      readBudgets().filter((budget) => budget.id !== id),
    )
  },
  getWorkSettings: async () =>
    read(scopedKey('work-settings'), DEFAULT_WORK_SETTINGS, (value) =>
      workSettingsSchema.parse(value),
    ),
  updateWorkSettings: async (settings) => {
    const parsed: WorkSettings = workSettingsSchema.parse(settings)
    write(scopedKey('work-settings'), parsed)
    return parsed
  },
  getAppVersion: async () => null,
}
