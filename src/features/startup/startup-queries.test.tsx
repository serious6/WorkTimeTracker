import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { setRepository } from '@/features/storage'
import { createLocalRepository } from '@/features/storage/local-repository'
import type { StartupStatus } from './startup-schema'
import { startupKeys, useRetryStartup, useStartupStatus } from './startup-queries'

function wrapper(queryClient: QueryClient) {
  return function Providers({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function testClient(): QueryClient {
  return new QueryClient({
    // The cache outlives the hooks of the test, so what a retry resets stays
    // observable.
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  })
}

afterEach(() => {
  setRepository(null)
})

describe('startup queries', () => {
  test('reads the startup status of the backend', async () => {
    setRepository({
      ...createLocalRepository(),
      startupStatus: async () => ({ status: 'failed', message: 'no database' }),
    })
    const queryClient = testClient()

    const { result } = renderHook(() => useStartupStatus(), { wrapper: wrapper(queryClient) })

    await waitFor(() => {
      expect(result.current.data).toEqual({ status: 'failed', message: 'no database' })
    })
  })

  test('a recovered start drops the errors the failed start cached', async () => {
    const retryStartup = vi.fn().mockResolvedValue({ status: 'ready' } satisfies StartupStatus)
    setRepository({ ...createLocalRepository(), retryStartup })
    const queryClient = testClient()
    queryClient.setQueryData(startupKeys.status, { status: 'failed', message: 'no database' })
    queryClient.setQueryData(['session'], null)

    const { result } = renderHook(() => useRetryStartup(), { wrapper: wrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(startupKeys.status)).toEqual({ status: 'ready' })
    })
    // The status of the retry survives, everything else is read again.
    expect(queryClient.getQueryData(['session'])).toBeUndefined()
  })

  test('a retry that fails again keeps the failure of the start', async () => {
    setRepository({
      ...createLocalRepository(),
      retryStartup: async () => ({ status: 'failed', message: 'still no database' }),
    })
    const queryClient = testClient()
    queryClient.setQueryData(['session'], null)

    const { result } = renderHook(() => useRetryStartup(), { wrapper: wrapper(queryClient) })
    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(startupKeys.status)).toEqual({
        status: 'failed',
        message: 'still no database',
      })
    })
    // Nothing is read again while the start is still broken.
    expect(queryClient.getQueryData(['session'])).toBeNull()
  })
})
