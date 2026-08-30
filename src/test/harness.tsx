import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { useNavigationStore } from '@/app/navigation'
import { useToastStore } from '@/components/ui/toast-store'
import type { AuthUser } from '@/features/auth/auth-schema'
import type { SaveProjectBudget } from '@/features/budgets/budget-schema'
import { useDashboardStore } from '@/features/dashboard/dashboard-store'
import type { Project } from '@/features/projects/project-schema'
import { localRepository } from '@/features/storage/local-repository'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { useTimerStore } from '@/features/timer/timer-store'
import { toDateKey } from '@/lib/date'

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
  await localRepository.logout()
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  useTimerStore.setState({ session: null, recovered: false })
  useNavigationStore.getState().navigate('dashboard')
  useDashboardStore.setState({ selectedDate: toDateKey(new Date()) })
  useToastStore.setState({ toasts: [] })
}

export async function signIn(email = 'tester@example.com'): Promise<AuthUser> {
  return localRepository.register({ email, password: TEST_PASSWORD })
}

export async function seedProject(
  name: string,
  overrides: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> = {},
): Promise<Project> {
  return localRepository.createProject({
    name,
    description: null,
    color: '#22c55e',
    active: true,
    ...overrides,
  })
}

export async function seedTimeEntry(input: {
  projectId: number
  startTime: Date | string
  endTime: Date | string | null
  note?: string | null
}): Promise<TimeEntry> {
  return localRepository.createTimeEntry({
    projectId: input.projectId,
    startTime: toIsoString(input.startTime),
    endTime: input.endTime === null ? null : toIsoString(input.endTime),
    note: input.note ?? null,
  })
}

export async function seedBudget(input: SaveProjectBudget) {
  return localRepository.createProjectBudget(input)
}

function toIsoString(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString()
}

/** A date at the given local time of day, relative to `reference`. */
export function atTime(reference: Date, hours: number, minutes = 0): Date {
  const date = new Date(reference)
  date.setHours(hours, minutes, 0, 0)
  return date
}
