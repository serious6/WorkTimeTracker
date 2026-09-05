import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestQueryClient, resetAppState, seedAbsence, signIn } from '@/test/harness'
import {
  useAbsenceAudits,
  useAbsenceIndex,
  useCreateAbsence,
  useUpdateAbsence,
} from './absence-queries'

const RANGE = { from: '2026-09-01', to: '2026-09-30' }

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useAbsenceIndex', () => {
  it('is empty while the window is still loading', () => {
    const { result } = renderHook(() => useAbsenceIndex(RANGE), { wrapper })

    expect(result.current.size).toBe(0)
  })

  it('maps every day of the window to its absence type', async () => {
    await seedAbsence({ type: 'vacation', date: '2026-09-01' })
    const { result } = renderHook(() => useAbsenceIndex(RANGE), { wrapper })

    await waitFor(() => expect(result.current.get('2026-09-01')).toBe('vacation'))
  })
})

describe('useAbsenceAudits', () => {
  it('reads the trail of a window', async () => {
    await seedAbsence({ type: 'sick', date: '2026-09-02' })
    const { result } = renderHook(() => useAbsenceAudits(RANGE), { wrapper })

    await waitFor(() => expect(result.current.data?.[0]?.action).toBe('created'))
  })
})

describe('useCreateAbsence', () => {
  it('creates an absence', async () => {
    const { result } = renderHook(() => useCreateAbsence(), { wrapper })
    const created = await result.current.mutateAsync({ type: 'vacation', date: '2026-09-03' })

    expect(created.date).toBe('2026-09-03')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useUpdateAbsence', () => {
  it('updates an absence', async () => {
    const absence = await seedAbsence({ type: 'vacation', date: '2026-09-04' })
    const { result } = renderHook(() => useUpdateAbsence(), { wrapper })
    const updated = await result.current.mutateAsync({
      id: absence.id,
      input: { type: 'unpaid', date: '2026-09-04' },
    })

    expect(updated.type).toBe('unpaid')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
