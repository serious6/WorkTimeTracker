import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { createTestQueryClient, resetAppState, signIn } from '@/test/harness'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useWorkSettings, useWorkSettingsQuery } from './work-settings-queries'
import { DEFAULT_WORK_SETTINGS } from './work-settings-schema'

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('useWorkSettingsQuery', () => {
  test('fetches and returns work settings', async () => {
    const qc = createTestQueryClient()
    const { result } = renderHook(() => useWorkSettingsQuery(), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.weeklyTargetMinutes).toBeGreaterThan(0)
    expect(result.current.data?.workingDays).toBeTruthy()
  })
})

describe('useWorkSettings', () => {
  test('returns defaults while loading', () => {
    const qc = createTestQueryClient()
    const { result } = renderHook(() => useWorkSettings(), { wrapper: wrapper(qc) })
    // Before the query resolves, data is undefined => defaults returned
    expect(result.current).toEqual(DEFAULT_WORK_SETTINGS)
  })

  test('returns loaded settings once query resolves', async () => {
    const qc = createTestQueryClient()
    const { result } = renderHook(() => useWorkSettings(), { wrapper: wrapper(qc) })
    await waitFor(() => {
      expect(result.current.weeklyTargetMinutes).toBeGreaterThan(0)
    })
  })
})
