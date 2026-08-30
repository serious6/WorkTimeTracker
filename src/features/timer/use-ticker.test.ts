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

  it('re-reads the clock when the window becomes visible again', () => {
    const { result } = renderHook(() => useTicker(true))
    const initial = result.current
    // The system slept: no interval fired while the app was hidden.
    vi.setSystemTime(new Date(Date.now() + 3_600_000))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBeGreaterThanOrEqual(initial + 3_600_000)
  })

  it('re-reads the clock when the window is focused again', () => {
    const { result } = renderHook(() => useTicker(true))
    const initial = result.current
    vi.setSystemTime(new Date(Date.now() + 60_000))
    act(() => {
      globalThis.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBeGreaterThanOrEqual(initial + 60_000)
  })

  it('ignores wake events after being disabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => useTicker(enabled), {
      initialProps: { enabled: true },
    })
    const initial = result.current
    rerender({ enabled: false })
    vi.setSystemTime(new Date(Date.now() + 60_000))
    act(() => {
      globalThis.dispatchEvent(new Event('focus'))
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
