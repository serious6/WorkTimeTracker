import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import { TEST_PASSWORD, resetAppState, signIn } from '@/test/harness'
import type { AuthUser } from './auth-schema'
import { endSession, sessionKeys, useLogin } from './session-queries'

beforeEach(async () => {
  await resetAppState()
})

describe('session queries', () => {
  it('drops the cached data when the session ended', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionKeys.current, { id: 1, email: 'first@example.com' })
    queryClient.setQueryData(['projects'], [{ id: 1 }])

    endSession(queryClient)

    expect(queryClient.getQueryData(sessionKeys.current)).toBeNull()
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
  })

  it('keeps the state when nobody is signed in', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionKeys.current, null)
    queryClient.setQueryData(['projects'], [])

    endSession(queryClient)

    expect(queryClient.getQueryData(['projects'])).toEqual([])
  })

  it('keeps the interrupted view when the session expires', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionKeys.current, { id: 1, email: 'first@example.com' })
    useNavigationStore.getState().navigate('budgets')

    endSession(queryClient)

    expect(useNavigationStore.getState().view).toBe('budgets')
  })
})

/** Signs in through the hook the login page uses. */
async function signInWith(queryClient: QueryClient, user: AuthUser): Promise<void> {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  const { result } = renderHook(() => useLogin(), { wrapper })
  result.current.mutate({ email: user.email, password: TEST_PASSWORD })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
}

describe('signing in after an expiry', () => {
  it('returns the same user to the interrupted view', async () => {
    const user = await signIn('first@example.com')
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionKeys.current, user)
    useNavigationStore.getState().navigate('budgets')
    endSession(queryClient)

    await signInWith(queryClient, user)

    expect(useNavigationStore.getState().view).toBe('budgets')
  })

  it('returns another user to the dashboard', async () => {
    const user = await signIn('first@example.com')
    const other = await signIn('second@example.com')
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionKeys.current, user)
    useNavigationStore.getState().navigate('budgets')
    endSession(queryClient)

    await signInWith(queryClient, other)

    expect(useNavigationStore.getState().view).toBe('dashboard')
  })
})
