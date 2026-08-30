import { z } from 'zod'
import {
  DUPLICATE_ABSENCE_MESSAGE,
  absenceAuditSchema,
  absenceSchema,
  saveAbsenceSchema,
  type Absence,
  type AbsenceAudit,
} from '@/features/absences/absence-schema'
import {
  TIME_ENTRY_ENTITY,
  auditLogEntrySchema,
  timeEntryAuditSchema,
  type AuditAction,
  type AuditLogEntry,
  type TimeEntryAudit,
} from '@/features/audit/audit-schema'
import {
  DUPLICATE_EMAIL_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  authUserSchema,
  credentialsSchema,
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
import {
  LOCKED_OUT_MESSAGE,
  LoginAttempts,
  PBKDF2_ITERATIONS,
  SESSION_TIMEOUT_MINUTES,
} from '@/features/auth/security-policy'
import { findOverlap } from '@/features/time-entries/overlap'
import {
  OVERLAP_MESSAGE,
  saveTimeEntrySchema,
  timeEntrySchema,
  type SaveTimeEntry,
  type TimeEntry,
} from '@/features/time-entries/time-entry-schema'
import {
  AUDIT_LOG_LIMIT,
  filterListRange,
  filterPointRange,
  limitAscending,
  limitDescending,
  listLimit,
  validateListRange,
} from './list-range'
import { AppError } from '@/lib/errors'
import type { Repository } from './repository'

const USERS_KEY = 'work-time-tracker.users'
const SCOPED_KEYS = [
  'projects',
  'time-entries',
  'project-budgets',
  'work-settings',
  'time-entry-audits',
  'time-entry-state',
  'audit-log',
  'absence-state',
] as const

type ScopedKey = (typeof SCOPED_KEYS)[number]

export const NOT_SIGNED_IN_MESSAGE = 'Please sign in first'

const storedUserSchema = authUserSchema.extend({ passwordHash: z.string() })

type StoredUser = z.infer<typeof storedUserSchema>
const entryStateSchema = z.object({
  entries: timeEntrySchema.array(),
  audits: timeEntryAuditSchema.array(),
})
type EntryState = z.infer<typeof entryStateSchema>

const absenceStateSchema = z.object({
  absences: absenceSchema.array(),
  audits: absenceAuditSchema.array(),
})
type AbsenceState = z.infer<typeof absenceStateSchema>

const SESSION_KEY = 'work-time-tracker.session'
const SESSIONS_KEY = 'work-time-tracker.sessions'

const sessionsSchema = z.record(
  z.string(),
  z.object({ userId: z.number().int().positive(), expiresAt: z.number().int().positive() }),
)

type Sessions = z.infer<typeof sessionsSchema>

const loginAttempts = new LoginAttempts()

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

function expiresAt(): number {
  return Date.now() + SESSION_TIMEOUT_MINUTES * 60_000
}

function readSessions(): Sessions {
  return read(SESSIONS_KEY, {}, (value) => sessionsSchema.parse(value))
}

/** Browser storage is a development and test fallback, not a security boundary. */
function startSession(userId: number): void {
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  write(SESSIONS_KEY, { [token]: { userId, expiresAt: expiresAt() } })
  globalThis.sessionStorage?.setItem(SESSION_KEY, token)
}

function endSession(): void {
  write(SESSIONS_KEY, {})
  globalThis.sessionStorage?.removeItem(SESSION_KEY)
}

/** An idle session ends after the timeout, every access extends it. */
function sessionUserId(): number | null {
  const token = globalThis.sessionStorage?.getItem(SESSION_KEY)
  const session = token ? readSessions()[token] : undefined
  if (!token || !session) return null
  if (session.expiresAt <= Date.now()) {
    endSession()
    return null
  }
  write(SESSIONS_KEY, { [token]: { userId: session.userId, expiresAt: expiresAt() } })
  return session.userId
}

function requireUserId(): number {
  const userId = sessionUserId()
  if (userId === null) throw new AppError('notSignedIn', NOT_SIGNED_IN_MESSAGE)
  return userId
}

/** Rejected input reads like a rejected command of the Rust backend. */
function validate<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new AppError('validation', parsed.error.issues[0]?.message ?? 'invalid input')
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
  return readEntryState().entries
}

function readAudits(): TimeEntryAudit[] {
  return readEntryState().audits
}

function entryStateKey(): string {
  return scopedKey('time-entry-state')
}

/** Records of the released `audit-log` key, kept when the trail moved. */
function legacyAudits(): TimeEntryAudit[] {
  const actor = currentActor()
  return read(scopedKey('audit-log'), [], (value) => auditLogEntrySchema.array().parse(value))
    .filter((record) => record.entity === TIME_ENTRY_ENTITY)
    .map((record) =>
      timeEntryAuditSchema.parse({
        id: record.id,
        timeEntryId: record.entityId,
        action: `${record.action}d`,
        actor,
        oldValue: record.oldValue,
        newValue: record.newValue,
        recordedAt: record.createdAt,
      }),
    )
}

/** Reads the state of the keys that were written before both were stored together. */
function migratedEntryState(): EntryState {
  const audits = [
    ...legacyAudits(),
    ...read(scopedKey('time-entry-audits'), [], (value) =>
      timeEntryAuditSchema.array().parse(value),
    ),
  ]
  return {
    entries: read(scopedKey('time-entries'), [], (value) => timeEntrySchema.array().parse(value)),
    audits: audits.map((audit, index) => ({ ...audit, id: index + 1 })),
  }
}

function readEntryState(): EntryState {
  const key = entryStateKey()
  if (globalThis.localStorage?.getItem(key) !== null) {
    return read(key, { entries: [], audits: [] }, (value) => entryStateSchema.parse(value))
  }
  return migratedEntryState()
}

function writeEntryState(entries: TimeEntry[], audits: TimeEntryAudit[]): void {
  write(entryStateKey(), { entries, audits })
}

function currentActor(): string {
  const userId = requireUserId()
  return readUsers().find((user) => user.id === userId)?.email ?? `user:${userId}`
}

/** Appends to the trail; recorded values are never modified or removed. */
function appendAudit(
  audits: TimeEntryAudit[],
  timeEntryId: number,
  action: AuditAction,
  oldValue: TimeEntry | null,
  newValue: TimeEntry | null,
): TimeEntryAudit[] {
  return [
    ...audits,
    timeEntryAuditSchema.parse({
      id: nextId(audits),
      timeEntryId,
      action,
      actor: currentActor(),
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      recordedAt: new Date().toISOString(),
    }),
  ]
}

function absenceStateKey(): string {
  return scopedKey('absence-state')
}

function readAbsenceState(): AbsenceState {
  return read(absenceStateKey(), { absences: [], audits: [] }, (value) =>
    absenceStateSchema.parse(value),
  )
}

function writeAbsenceState(absences: Absence[], audits: AbsenceAudit[]): void {
  write(absenceStateKey(), { absences, audits })
}

/** Appends to the trail; recorded values are never modified or removed. */
function appendAbsenceAudit(
  audits: AbsenceAudit[],
  absenceId: number,
  action: AuditAction,
  oldValue: Absence | null,
  newValue: Absence | null,
): AbsenceAudit[] {
  return [
    ...audits,
    absenceAuditSchema.parse({
      id: nextId(audits),
      absenceId,
      action,
      actor: currentActor(),
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      recordedAt: new Date().toISOString(),
    }),
  ]
}

function readBudgets(): ProjectBudget[] {
  return read(scopedKey('project-budgets'), [], (value) => projectBudgetSchema.array().parse(value))
}

function nextId(records: { id: number }[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.id), 0) + 1
}

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

/**
 * Passwords are stored as a salted PBKDF2 digest, never in plaintext. The
 * fallback is limited to the primitives of the browser, the Tauri backend uses
 * Argon2id for real credentials.
 */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const digest = await derive(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${digest}`
}

function equals(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
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

export const FALLBACK_NOT_ALLOWED_MESSAGE =
  'The browser fallback repository is only available in development and test builds'

/**
 * Browser fallback used for UI development and end-to-end tests. It mirrors the
 * behaviour of the Rust commands, including overlap rejection.
 */
const fallbackRepository: Repository = {
  currentSession: async () => {
    const user = readUsers().find(({ id }) => id === sessionUserId())
    return user ? toAuthUser(user) : null
  },
  register: async (credentials: Credentials) => {
    const parsed = registrationSchema.safeParse(credentials)
    if (!parsed.success) {
      const emailError = parsed.error.issues.find((issue) => issue.path[0] === 'email')
      if (emailError) throw new AppError('validation', emailError.message)
      throw new AppError('validation', PASSWORD_POLICY_MESSAGE)
    }
    const { email, password } = parsed.data
    const users = readUsers()
    if (users.some((user) => user.email === email)) {
      throw new AppError('conflict', DUPLICATE_EMAIL_MESSAGE)
    }
    const user: StoredUser = {
      id: nextId(users),
      email,
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
    }
    write(USERS_KEY, [...users, user])
    startSession(user.id)
    if (users.length === 0) claimLegacyData(user.id)
    return toAuthUser(user)
  },
  login: async (credentials: Credentials) => {
    const { email, password } = validate(credentialsSchema, credentials)
    if (!loginAttempts.allows(email)) throw new AppError('rateLimited', LOCKED_OUT_MESSAGE)
    const user = readUsers().find((stored) => stored.email === email)
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      loginAttempts.recordFailure(email)
      throw new AppError('validation', INVALID_CREDENTIALS_MESSAGE)
    }
    loginAttempts.recordSuccess(email)
    startSession(user.id)
    return toAuthUser(user)
  },
  logout: async () => {
    endSession()
  },
  listProjects: async () => readProjects().sort((left, right) => left.name.localeCompare(right.name)),
  createProject: async (input) => {
    const parsed = validate(saveProjectSchema, input)
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
    const parsed: SaveProject = validate(saveProjectSchema, input)
    const projects = readProjects()
    const current = projects.find((project) => project.id === id)
    if (!current) throw new AppError('notFound', 'Project not found')
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
    const { entries, audits } = readEntryState()
    const updatedAt = new Date().toISOString()
    const updatedEntries = entries.map((entry) =>
      entry.projectId === id ? { ...entry, projectId: null, updatedAt } : entry,
    )
    const updatedAudits = entries.reduce(
      (all, entry) =>
        entry.projectId === id
          ? appendAudit(all, entry.id, 'updated', entry, { ...entry, projectId: null, updatedAt })
          : all,
      audits,
    )
    writeEntryState(updatedEntries, updatedAudits)
  },
  listTimeEntries: async (range) => {
    const window = validateListRange(range)
    return limitAscending(
      filterListRange(
        readEntries().sort((left, right) => left.startTime.localeCompare(right.startTime)),
        window,
        (entry) => ({ start: entry.startTime, end: entry.endTime }),
      ),
      listLimit(window),
    )
  },
  createTimeEntry: async (input) => {
    const parsed: SaveTimeEntry = validate(saveTimeEntrySchema, input)
    if (parsed.entryType !== 'break' && parsed.projectId === null) {
      throw new AppError('validation', 'Project is required')
    }
    const { entries, audits } = readEntryState()
    if (findOverlap(entries, parsed)) throw new AppError('conflict', OVERLAP_MESSAGE)
    const now = new Date().toISOString()
    const entry = timeEntrySchema.parse({
      ...parsed,
      id: nextId([...entries, ...audits.map(({ timeEntryId: id }) => ({ id }))]),
      createdAt: now,
      updatedAt: now,
    })
    writeEntryState([...entries, entry], appendAudit(audits, entry.id, 'created', null, entry))
    return entry
  },
  updateTimeEntry: async (id, input) => {
    const parsed: SaveTimeEntry = validate(saveTimeEntrySchema, input)
    const { entries, audits } = readEntryState()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new AppError('notFound', 'Time entry not found')
    if ((parsed.entryType ?? current.entryType) === 'break' && parsed.projectId !== null) {
      throw new AppError('validation', 'A break is not booked on a project')
    }
    if (findOverlap(entries, parsed, id)) throw new AppError('conflict', OVERLAP_MESSAGE)
    const updated = timeEntrySchema.parse({
      ...current,
      ...parsed,
      entryType: parsed.entryType ?? current.entryType,
      updatedAt: new Date().toISOString(),
    })
    writeEntryState(
      entries.map((entry) => (entry.id === id ? updated : entry)),
      appendAudit(audits, id, 'updated', current, updated),
    )
    return updated
  },
  updateTimeEntryNote: async (id, note) => {
    const { entries, audits } = readEntryState()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new AppError('notFound', 'Time entry not found')
    const updated = timeEntrySchema.parse({
      ...current,
      note: note?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    writeEntryState(
      entries.map((entry) => (entry.id === id ? updated : entry)),
      appendAudit(audits, id, 'updated', current, updated),
    )
    return updated
  },
  switchRunningTimeEntry: async (id, input) => {
    const parsed: SaveTimeEntry = validate(saveTimeEntrySchema, input)
    if (parsed.projectId === null || parsed.endTime !== null) throw new AppError('validation', 'Invalid timer switch')
    const { entries, audits } = readEntryState()
    const current = entries.find((entry) => entry.id === id)
    if (!current) throw new AppError('notFound', 'Time entry not found')
    if (current.endTime !== null) throw new AppError('validation', 'Timer is not running')
    if (parsed.startTime <= current.startTime) throw new AppError('validation', 'End time must be later than start time')
    const closed = timeEntrySchema.parse({
      ...current,
      endTime: parsed.startTime,
      updatedAt: new Date().toISOString(),
    })
    const nextEntries = entries.map((entry) => (entry.id === id ? closed : entry))
    if (findOverlap(nextEntries, parsed)) throw new AppError('conflict', OVERLAP_MESSAGE)
    const now = new Date().toISOString()
    const created = timeEntrySchema.parse({
      ...parsed,
      id: nextId([...entries, ...audits.map(({ timeEntryId: id }) => ({ id }))]),
      createdAt: now,
      updatedAt: now,
    })
    writeEntryState(
      [...nextEntries, created],
      appendAudit(appendAudit(audits, id, 'updated', current, closed), created.id, 'created', null, created),
    )
    return created
  },
  deleteTimeEntry: async (id) => {
    const { entries, audits } = readEntryState()
    const current = entries.find((entry) => entry.id === id)
    writeEntryState(
      entries.filter((entry) => entry.id !== id),
      current ? appendAudit(audits, id, 'deleted', current, null) : audits,
    )
  },
  listTimeEntryAudits: async (range) => {
    const window = validateListRange(range)
    return limitDescending(
      filterPointRange(
        readAudits().sort(
          (left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.id - left.id,
        ),
        window,
        (audit) => audit.recordedAt,
      ),
      listLimit(window),
    )
  },
  listAuditLog: async (range) => {
    const window = validateListRange(range)
    return limitDescending(
      filterPointRange(readAudits(), window, (audit) => audit.recordedAt).map((audit): AuditLogEntry => ({
        id: audit.id,
        entity: TIME_ENTRY_ENTITY,
        entityId: audit.timeEntryId,
        action: audit.action.slice(0, -1) as AuditLogEntry['action'],
        oldValue: audit.oldValue,
        newValue: audit.newValue,
        createdAt: audit.recordedAt,
      }))
        .sort((left, right) => right.id - left.id),
      Math.min(listLimit(window, AUDIT_LOG_LIMIT), AUDIT_LOG_LIMIT),
    )
  },
  listProjectBudgets: async () =>
    readBudgets().sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
  createProjectBudget: async (input) => {
    const parsed = validate(saveProjectBudgetSchema, input)
    const budgets = readBudgets()
    if (budgets.some((budget) => budget.projectId === parsed.projectId)) {
      throw new AppError('conflict', DUPLICATE_BUDGET_MESSAGE)
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
    const parsed = validate(saveProjectBudgetSchema, input)
    const budgets = readBudgets()
    const current = budgets.find((budget) => budget.id === id)
    if (!current) throw new AppError('notFound', 'Budget not found')
    if (budgets.some((budget) => budget.projectId === parsed.projectId && budget.id !== id)) {
      throw new AppError('conflict', DUPLICATE_BUDGET_MESSAGE)
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
  listAbsences: async (range) => {
    const window = validateListRange(range)
    return limitAscending(
      filterPointRange(
        readAbsenceState().absences.sort((left, right) => left.date.localeCompare(right.date)),
        window,
        (absence) => absence.date,
      ),
      listLimit(window),
    )
  },
  createAbsence: async (input) => {
    const parsed = validate(saveAbsenceSchema, input)
    const { absences, audits } = readAbsenceState()
    if (absences.some((absence) => absence.date === parsed.date)) {
      throw new AppError('conflict', DUPLICATE_ABSENCE_MESSAGE)
    }
    const now = new Date().toISOString()
    const absence = absenceSchema.parse({
      ...parsed,
      id: nextId(absences),
      createdAt: now,
      updatedAt: now,
    })
    writeAbsenceState(
      [...absences, absence],
      appendAbsenceAudit(audits, absence.id, 'created', null, absence),
    )
    return absence
  },
  updateAbsence: async (id, input) => {
    const parsed = validate(saveAbsenceSchema, input)
    const { absences, audits } = readAbsenceState()
    const current = absences.find((absence) => absence.id === id)
    if (!current) throw new AppError('notFound', 'Absence not found')
    if (absences.some((absence) => absence.date === parsed.date && absence.id !== id)) {
      throw new AppError('conflict', DUPLICATE_ABSENCE_MESSAGE)
    }
    const updated = { ...current, ...parsed, updatedAt: new Date().toISOString() }
    writeAbsenceState(
      absences.map((absence) => (absence.id === id ? updated : absence)),
      appendAbsenceAudit(audits, id, 'updated', current, updated),
    )
    return updated
  },
  saveAbsences: async (inputs, replacementIds, updateId) => {
    const parsed = inputs.map((input) => validate(saveAbsenceSchema, input))
    if (parsed.length === 0 || new Set(parsed.map((absence) => absence.date)).size !== parsed.length) {
      throw new AppError('validation', 'Invalid absence range')
    }
    const { absences, audits } = readAbsenceState()
    const replacements = new Set(replacementIds)
    const current = updateId === undefined ? undefined : absences.find((absence) => absence.id === updateId)
    if (updateId !== undefined && !current) throw new AppError('notFound', 'Absence not found')
    const retained = absences.filter((absence) => !replacements.has(absence.id) && absence.id !== updateId)
    if (parsed.some((input) => retained.some((absence) => absence.date === input.date))) {
      throw new AppError('conflict', DUPLICATE_ABSENCE_MESSAGE)
    }
    const now = new Date().toISOString()
    let nextAbsenceId = nextId(absences)
    const saved = parsed.map((input, index) =>
      absenceSchema.parse({
        ...input,
        id: index === 0 && current ? current.id : nextAbsenceId++,
        createdAt: index === 0 && current ? current.createdAt : now,
        updatedAt: now,
      }),
    )
    const replacementRecords = absences.filter((absence) => replacements.has(absence.id))
    const nextAudits = replacementRecords.reduce(
      (all, absence) => appendAbsenceAudit(all, absence.id, 'deleted', absence, null),
      audits,
    )
    const withUpdateAudit = current
      ? appendAbsenceAudit(nextAudits, current.id, 'updated', current, saved[0]!)
      : nextAudits
    writeAbsenceState(
      [...retained, ...saved],
      saved.slice(current ? 1 : 0).reduce(
        (all, absence) => appendAbsenceAudit(all, absence.id, 'created', null, absence),
        withUpdateAudit,
      ),
    )
    return saved
  },
  deleteAbsence: async (id) => {
    const { absences, audits } = readAbsenceState()
    const current = absences.find((absence) => absence.id === id) ?? null
    writeAbsenceState(
      absences.filter((absence) => absence.id !== id),
      current ? appendAbsenceAudit(audits, id, 'deleted', current, null) : audits,
    )
  },
  listAbsenceAudits: async () =>
    readAbsenceState().audits.sort((left, right) => right.id - left.id),
  getWorkSettings: async () =>
    read(scopedKey('work-settings'), DEFAULT_WORK_SETTINGS, (value) =>
      workSettingsSchema.parse(value),
    ),
  updateWorkSettings: async (settings) => {
    const parsed: WorkSettings = validate(workSettingsSchema, settings)
    write(scopedKey('work-settings'), parsed)
    return parsed
  },
  getAppVersion: async () => null,
}

/**
 * Builds the fallback. Client-side storage is readable and writable by the user,
 * so the fallback is a development and test tool and never a security boundary:
 * constructing it in a production build is a bug and fails loudly.
 */
export function createLocalRepository(): Repository {
  if (!import.meta.env.DEV && !import.meta.env.MODE.startsWith('test')) {
    throw new Error(FALLBACK_NOT_ALLOWED_MESSAGE)
  }
  return fallbackRepository
}
