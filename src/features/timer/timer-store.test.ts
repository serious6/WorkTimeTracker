import { describe, expect, it } from 'vitest'
import { useTimerStore } from './timer-store'

describe('useTimerStore', () => {
  it('starts with no session', () => {
    useTimerStore.setState({ session: null })
    expect(useTimerStore.getState().session).toBeNull()
  })

  it('setSession stores a session', () => {
    useTimerStore.setState({ session: null })
    useTimerStore.getState().setSession({ projectId: 1, carriedMs: 0, paused: false })
    expect(useTimerStore.getState().session).toEqual({ projectId: 1, carriedMs: 0, paused: false })
  })

  it('setSession can clear the session', () => {
    useTimerStore.getState().setSession({ projectId: 1, carriedMs: 0, paused: false })
    useTimerStore.getState().setSession(null)
    expect(useTimerStore.getState().session).toBeNull()
  })

  it('setSession stores a paused session with carriedMs', () => {
    useTimerStore.getState().setSession({ projectId: 2, carriedMs: 60_000, paused: true })
    expect(useTimerStore.getState().session?.paused).toBe(true)
    expect(useTimerStore.getState().session?.carriedMs).toBe(60_000)
  })

  it('setSession allows null projectId', () => {
    useTimerStore.getState().setSession({ projectId: null, carriedMs: 0, paused: false })
    expect(useTimerStore.getState().session?.projectId).toBeNull()
  })
})
