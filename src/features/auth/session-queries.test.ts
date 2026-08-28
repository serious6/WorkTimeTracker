import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { endSession, sessionKeys } from './session-queries'

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
})
