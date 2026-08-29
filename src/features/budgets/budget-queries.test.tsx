import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, toDateKey } from '@/lib/date'
import {
  createTestQueryClient,
  resetAppState,
  seedBudget,
  seedProject,
  signIn,
} from '@/test/harness'
import {
  useProjectBudgets,
  useCreateProjectBudget,
  useUpdateProjectBudget,
  useDeleteProjectBudget,
} from './budget-queries'

const FUTURE_DATE = toDateKey(addDays(new Date(), 30))

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useProjectBudgets', () => {
  it('returns seeded budgets', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    const { result } = renderHook(() => useProjectBudgets(), { wrapper })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
  })
})

describe('useCreateProjectBudget', () => {
  it('creates a budget', async () => {
    const project = await seedProject('Alpha')
    const { result } = renderHook(() => useCreateProjectBudget(), { wrapper })
    await result.current.mutateAsync({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useUpdateProjectBudget', () => {
  it('updates a budget', async () => {
    const project = await seedProject('Alpha')
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    const { result } = renderHook(() => useUpdateProjectBudget(), { wrapper })
    await result.current.mutateAsync({
      id: budget.id,
      input: { projectId: project.id, budgetMinutes: 6000, dueDate: FUTURE_DATE },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteProjectBudget', () => {
  it('deletes a budget', async () => {
    const project = await seedProject('Alpha')
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    const { result } = renderHook(() => useDeleteProjectBudget(), { wrapper })
    await result.current.mutateAsync(budget.id)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
