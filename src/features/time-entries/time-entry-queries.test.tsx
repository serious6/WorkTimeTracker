import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestQueryClient,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import {
  useTimeEntries,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
} from './time-entry-queries'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTimeEntries', () => {
  it('returns seeded entries', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })
    const { result } = renderHook(() => useTimeEntries(), { wrapper })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
  })
})

describe('useCreateTimeEntry', () => {
  it('creates an entry', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const { result } = renderHook(() => useCreateTimeEntry(), { wrapper })
    await result.current.mutateAsync({
      projectId: project.id,
      startTime: atTime(ref, 9).toISOString(),
      endTime: atTime(ref, 10).toISOString(),
      note: null,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useUpdateTimeEntry', () => {
  it('updates an entry', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const entry = await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })
    const { result } = renderHook(() => useUpdateTimeEntry(), { wrapper })
    await result.current.mutateAsync({
      id: entry.id,
      input: {
        projectId: project.id,
        startTime: atTime(ref, 9).toISOString(),
        endTime: atTime(ref, 11).toISOString(),
        note: 'updated',
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteTimeEntry', () => {
  it('deletes an entry', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const entry = await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })
    const { result } = renderHook(() => useDeleteTimeEntry(), { wrapper })
    await result.current.mutateAsync(entry.id)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
