import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestQueryClient,
  resetAppState,
  seedProject,
  signIn,
} from '@/test/harness'
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from './project-queries'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useProjects', () => {
  it('returns seeded projects', async () => {
    await seedProject('Alpha')
    const { result } = renderHook(() => useProjects(), { wrapper })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThan(0))
    expect(result.current.data?.some((p) => p.name === 'Alpha')).toBe(true)
  })
})

describe('useCreateProject', () => {
  it('creates a project', async () => {
    const { result } = renderHook(() => useCreateProject(), { wrapper })
    await result.current.mutateAsync({ name: 'New', color: '#22c55e', description: null, active: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useUpdateProject', () => {
  it('updates a project', async () => {
    const project = await seedProject('OldName')
    const { result } = renderHook(() => useUpdateProject(), { wrapper })
    await result.current.mutateAsync({
      id: project.id,
      input: { name: 'NewName', color: '#22c55e', description: null, active: true },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useDeleteProject', () => {
  it('deletes a project', async () => {
    const project = await seedProject('ToDelete')
    const { result } = renderHook(() => useDeleteProject(), { wrapper })
    await result.current.mutateAsync(project.id)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
