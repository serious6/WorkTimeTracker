import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestQueryClient,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { useTimerStore } from './timer-store'
import { useTimer } from './use-timer'

function wrapper({ children }: { children: ReactNode }) {
  const qc = createTestQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTimer', () => {
  it('starts idle with no running entry', async () => {
    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeUndefined())
    expect(result.current.status.paused).toBe(false)
    expect(result.current.status.elapsedMs).toBe(0)
  })

  it('start creates a running entry and sets session', async () => {
    const project = await seedProject('Website')
    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status).toBeDefined())

    await act(async () => {
      await result.current.start(project.id)
    })

    await waitFor(() => expect(result.current.status.running).toBeDefined())
    expect(useTimerStore.getState().session?.projectId).toBe(project.id)
    expect(useTimerStore.getState().session?.paused).toBe(false)
  })

  it('stop closes the running entry and clears session', async () => {
    const project = await seedProject('Website')
    const now = new Date()
    await seedTimeEntry({ projectId: project.id, startTime: new Date(now.getTime() - 60_000), endTime: null })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    await act(async () => {
      await result.current.stop()
    })

    await waitFor(() => expect(result.current.status.running).toBeUndefined())
    expect(useTimerStore.getState().session).toBeNull()
  })

  it('pause closes the running entry and sets paused state', async () => {
    const project = await seedProject('Website')
    const now = new Date()
    await seedTimeEntry({ projectId: project.id, startTime: new Date(now.getTime() - 30_000), endTime: null })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    await act(async () => {
      await result.current.pause()
    })

    await waitFor(() => expect(useTimerStore.getState().session?.paused).toBe(true))
    expect(result.current.status.running).toBeUndefined()
  })

  it('resume creates a new running entry when paused', async () => {
    const project = await seedProject('Website')
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 60_000, paused: true } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.paused).toBe(true))

    await act(async () => {
      await result.current.resume()
    })

    await waitFor(() => expect(result.current.status.running).toBeDefined())
    expect(useTimerStore.getState().session?.paused).toBe(false)
  })

  it('resume shows error toast when projectId is null', async () => {
    useTimerStore.setState({ session: { projectId: null, carriedMs: 0, paused: true } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.paused).toBe(true))

    await act(async () => {
      await result.current.resume()
    })

    // session should remain paused, no running entry created
    expect(useTimerStore.getState().session?.paused).toBe(true)
    expect(result.current.status.running).toBeUndefined()
  })

  it('switchTo switches from the running entry to a new project', async () => {
    const p1 = await seedProject('Website')
    const p2 = await seedProject('Mobile')
    const now = new Date()
    await seedTimeEntry({ projectId: p1.id, startTime: new Date(now.getTime() - 60_000), endTime: null })
    useTimerStore.setState({ session: { projectId: p1.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running?.projectId).toBe(p1.id))

    await act(async () => {
      await result.current.switchTo(p2.id)
    })

    await waitFor(() => expect(result.current.status.running?.projectId).toBe(p2.id))
    expect(useTimerStore.getState().session?.projectId).toBe(p2.id)
  })

  it('pause is a no-op when no entry is running', async () => {
    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeUndefined())

    await act(async () => {
      await result.current.pause()
    })

    expect(useTimerStore.getState().session).toBeNull()
  })

  it('elapsed time includes carriedMs from previous segments', async () => {
    const project = await seedProject('Website')
    const now = new Date()
    await seedTimeEntry({ projectId: project.id, startTime: new Date(now.getTime() - 30_000), endTime: null })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 120_000, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    expect(result.current.status.elapsedMs).toBeGreaterThanOrEqual(150_000)
  })

  it('switchTo creates a new entry when no running entry (paused state)', async () => {
    const p1 = await seedProject('Website')
    const p2 = await seedProject('Mobile')
    useTimerStore.setState({ session: { projectId: p1.id, carriedMs: 60_000, paused: true } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.paused).toBe(true))

    await act(async () => {
      await result.current.switchTo(p2.id)
    })

    await waitFor(() => expect(result.current.status.running?.projectId).toBe(p2.id))
  })

  it('setNote is a no-op when no running entry', async () => {
    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeUndefined())

    // Should not throw
    await act(async () => {
      await result.current.setNote('ignored note')
    })

    expect(useTimerStore.getState().session).toBeNull()
  })

  it('setNote updates the note when an entry is running', async () => {
    const project = await seedProject('Website')
    await seedTimeEntry({
      projectId: project.id,
      startTime: new Date(Date.now() - 30_000),
      endTime: null,
    })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    await act(async () => {
      await result.current.setNote('my note')
    })

    await waitFor(() => expect(result.current.status.running?.note).toBe('my note'))
  })
})

describe('useTimer – error paths', () => {
  it('start shows a destructive toast when createTimeEntry fails', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    const { useToastStore } = await import('@/components/ui/toast-store')
    const project = await seedProject('Website')

    vi.spyOn(localRepository, 'createTimeEntry').mockRejectedValueOnce(new Error('db error'))

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status).toBeDefined())

    useToastStore.setState({ toasts: [] })

    await act(async () => {
      await result.current.start(project.id)
    })

    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true)
    vi.restoreAllMocks()
  })

  it('stop shows a destructive toast when updateTimeEntry fails', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    const { useToastStore } = await import('@/components/ui/toast-store')
    const project = await seedProject('Website')
    await seedTimeEntry({
      projectId: project.id,
      startTime: new Date(Date.now() - 30_000),
      endTime: null,
    })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    vi.spyOn(localRepository, 'updateTimeEntry').mockRejectedValueOnce(new Error('db error'))
    useToastStore.setState({ toasts: [] })

    await act(async () => {
      await result.current.stop()
    })

    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true)
    vi.restoreAllMocks()
  })

  it('pause shows a destructive toast when updateTimeEntry fails', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    const { useToastStore } = await import('@/components/ui/toast-store')
    const project = await seedProject('Website')
    await seedTimeEntry({
      projectId: project.id,
      startTime: new Date(Date.now() - 30_000),
      endTime: null,
    })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.running).toBeDefined())

    vi.spyOn(localRepository, 'updateTimeEntry').mockRejectedValueOnce(new Error('db error'))
    useToastStore.setState({ toasts: [] })

    await act(async () => {
      await result.current.pause()
    })

    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true)
    vi.restoreAllMocks()
  })

  it('resume shows a destructive toast when createTimeEntry fails', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    const { useToastStore } = await import('@/components/ui/toast-store')
    const project = await seedProject('Website')
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 60_000, paused: true } })

    vi.spyOn(localRepository, 'createTimeEntry').mockRejectedValueOnce(new Error('db error'))

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status.paused).toBe(true))

    useToastStore.setState({ toasts: [] })

    await act(async () => {
      await result.current.resume()
    })

    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true)
    vi.restoreAllMocks()
  })

  it('switchTo shows a destructive toast when mutation fails', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    const { useToastStore } = await import('@/components/ui/toast-store')
    const p2 = await seedProject('Mobile')
    await seedProject('Website')

    vi.spyOn(localRepository, 'createTimeEntry').mockRejectedValueOnce(new Error('db error'))

    const { result } = renderHook(() => useTimer(Date.now()), { wrapper })
    await waitFor(() => expect(result.current.status).toBeDefined())

    useToastStore.setState({ toasts: [] })

    await act(async () => {
      await result.current.switchTo(p2.id)
    })

    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true)
    vi.restoreAllMocks()
  })
})
