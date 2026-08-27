import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimerStore } from './timer-store'

describe('timer store', () => {
  beforeEach(() => useTimerStore.setState({ startedAt: null }))

  it('starts and stops a timer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'))
    useTimerStore.getState().start()
    expect(useTimerStore.getState().startedAt).toBe('2026-08-27T12:00:00.000Z')

    useTimerStore.getState().stop()
    expect(useTimerStore.getState().startedAt).toBeNull()
    vi.useRealTimers()
  })
})
