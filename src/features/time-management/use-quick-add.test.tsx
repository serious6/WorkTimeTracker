import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import { fromDateKey, toDateKey } from '@/lib/date'
import {
  createTestQueryClient,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import { useQuickAdd, DAY_FULL_MESSAGE } from './use-quick-add'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { createLocalRepository } from '@/features/storage/local-repository'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

const TODAY = toDateKey(new Date())

function renderQuickAdd() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const entries = renderHook(() => useTimeEntries(), { wrapper })
  const hook = renderHook(() => useQuickAdd(), { wrapper })
  return { hook: hook.result, entries: entries.result }
}

describe('useQuickAdd', () => {
  it('creates a time entry in the first free slot', async () => {
    const project = await seedProject('Alpha')
    const { hook, entries } = renderQuickAdd()
    await waitFor(() => expect(entries.current.isSuccess).toBe(true))
    await hook.current({ projectId: project.id, dateKey: TODAY, minutes: 30 })
    await waitFor(async () =>
      expect(await createLocalRepository().listTimeEntries()).toContainEqual(
        expect.objectContaining({
          projectId: project.id,
          startTime: atTime(fromDateKey(TODAY), 9, 0).toISOString(),
          endTime: atTime(fromDateKey(TODAY), 9, 30).toISOString(),
        }),
      ),
    )
  })

  it('throws DAY_FULL_MESSAGE when no slot is available', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    // A running entry (no endTime) blocks everything from midnight onward
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 0, 0),
      endTime: null,
    })

    const { hook, entries } = renderQuickAdd()
    await waitFor(() => expect(entries.current.isSuccess).toBe(true))

    await expect(
      hook.current({ projectId: project.id, dateKey: TODAY, minutes: 60 }),
    ).rejects.toThrow(DAY_FULL_MESSAGE)
  })

  it('uses the provided note', async () => {
    const project = await seedProject('Alpha')
    const { hook, entries } = renderQuickAdd()
    await waitFor(() => expect(entries.current.isSuccess).toBe(true))
    await hook.current({ projectId: project.id, dateKey: TODAY, minutes: 15, note: 'test note' })
    await waitFor(async () =>
      expect(await createLocalRepository().listTimeEntries()).toContainEqual(
        expect.objectContaining({ projectId: project.id, note: 'test note' }),
      ),
    )
  })
})
