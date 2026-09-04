import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { useToastStore } from '@/components/ui/toast-store'
import type { AuthUser } from '@/features/auth/auth-schema'
import type { SaveProjectBudget } from '@/features/budgets/budget-schema'
import { useDashboardStore } from '@/features/dashboard/dashboard-store'
import type { OvertimeEntry, SaveOvertimeEntry } from '@/features/overtime/overtime-schema'
import type { Project } from '@/features/projects/project-schema'
import { createLocalRepository } from '@/features/storage/local-repository'
import type { EntryType, TimeEntry } from '@/features/time-entries/time-entry-schema'
import { useTimerStore } from '@/features/timer/timer-store'
import { toDateKey } from '@/lib/date'
import {
  AUTH_STORAGE_KEYS,
  securityAuditsKey,
  seededAuthUser,
  seededRegistrationAudit,
  seededSession,
} from './auth-fixture'

/** Satisfies the password policy, so registrations succeed. */
export const TEST_PASSWORD = 'Str0ng-Passphrase!!x'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

/** Renders below the providers the application relies on. */
export function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
) {
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...result, queryClient }
}

/** Clears stored data and the client side stores between tests. */
export async function resetAppState(): Promise<void> {
  await createLocalRepository().logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  useTimerStore.setState({ session: null, recovered: false })
  useNavigationStore.setState({ sidebarExpanded: true })
  useNavigationStore.getState().navigate('dashboard')
  useDashboardStore.setState({ selectedDate: toDateKey(new Date()) })
  useToastStore.setState({ toasts: [] })
}

export async function signIn(email = 'tester@example.com'): Promise<AuthUser> {
  const users = JSON.parse(globalThis.localStorage?.getItem(AUTH_STORAGE_KEYS.users) ?? '[]') as Array<
    AuthUser & { passwordHash: string }
  >
  const user = { id: nextId(users), email, createdAt: new Date().toISOString() }
  globalThis.localStorage?.setItem(
    AUTH_STORAGE_KEYS.users,
    JSON.stringify([...users, seededAuthUser(user.id, user.email, user.createdAt)]),
  )
  globalThis.localStorage?.setItem(
    securityAuditsKey(user.id),
    JSON.stringify([seededRegistrationAudit(user.id, email, user.createdAt)]),
  )
  const startedAt = Date.now()
  const { token, session } = seededSession(user.id, startedAt)
  const sessions = JSON.parse(globalThis.localStorage?.getItem(AUTH_STORAGE_KEYS.sessions) ?? '{}')
  globalThis.localStorage?.setItem(AUTH_STORAGE_KEYS.sessions, JSON.stringify({ ...sessions, [token]: session }))
  globalThis.sessionStorage?.setItem(AUTH_STORAGE_KEYS.session, token)
  return user
}

export async function seedProject(
  name: string,
  overrides: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Promise<Project> {
  return createLocalRepository().createProject({
    name,
    description: null,
    color: '#22c55e',
    active: true,
    archived: false,
    ...overrides,
  })
}

export async function seedTimeEntry(input: {
  projectId: number | null
  startTime: Date | string
  endTime: Date | string | null
  entryType?: EntryType
  note?: string | null
}): Promise<TimeEntry> {
  return createLocalRepository().createTimeEntry({
    projectId: input.projectId,
    startTime: toIsoString(input.startTime),
    endTime: input.endTime === null ? null : toIsoString(input.endTime),
    entryType: input.entryType,
    note: input.note ?? null,
  })
}

/** A break entry, which is never booked on a project. */
export async function seedBreak(input: {
  startTime: Date | string
  endTime: Date | string
}): Promise<TimeEntry> {
  return seedTimeEntry({ ...input, projectId: null, entryType: 'break' })
}

export async function seedBudget(input: SaveProjectBudget) {
  return createLocalRepository().createProjectBudget(input)
}

export async function seedOvertimeEntry(
  input: Omit<SaveOvertimeEntry, 'origin' | 'note'> & Partial<SaveOvertimeEntry>,
): Promise<OvertimeEntry> {
  return createLocalRepository().createOvertimeEntry({
    origin: 'manual',
    note: null,
    ...input,
  })
}

function toIsoString(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString()
}

function nextId(records: { id: number }[]): number {
  return records.reduce((highest, record) => Math.max(highest, record.id), 0) + 1
}

/** A date at the given local time of day, relative to `reference`. */
export function atTime(reference: Date, hours: number, minutes = 0): Date {
  const date = new Date(reference)
  date.setHours(hours, minutes, 0, 0)
  return date
}
