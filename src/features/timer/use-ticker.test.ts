import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTicker } from './use-ticker'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTicker', () => {
  it('returns the current time when enabled', () => {
    const { result } = renderHook(() => useTicker(true))
    expect(result.current).toBeGreaterThan(0)
  })

  it('advances the tick every second when enabled', () => {
    const { result } = renderHook(() => useTicker(true))
    const initial = result.current
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current).toBeGreaterThan(initial)
  })

  it('does not advance when disabled', () => {
    const { result } = renderHook(() => useTicker(false))
    const initial = result.current
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(initial)
  })

  it('stops ticking after being disabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => useTicker(enabled), {
      initialProps: { enabled: true },
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    const afterFirst = result.current
    rerender({ enabled: false })
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(afterFirst)
  })
})
