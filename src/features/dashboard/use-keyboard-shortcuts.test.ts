import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toDateKey } from '@/lib/date'
import { useDashboardStore } from './dashboard-store'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

function setup() {
  const onAddEntry = vi.fn()
  const onProjectSearch = vi.fn()
  const onToggleTimer = vi.fn()
  const { unmount } = renderHook(() =>
    useKeyboardShortcuts({ onAddEntry, onProjectSearch, onToggleTimer }),
  )
  return { onAddEntry, onProjectSearch, onToggleTimer, unmount }
}

beforeEach(() => {
  useDashboardStore.setState({ selectedDate: '2026-08-27' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useKeyboardShortcuts', () => {
  it('Ctrl+N calls onAddEntry', () => {
    const { onAddEntry } = setup()
    fireKey('n', { ctrlKey: true })
    expect(onAddEntry).toHaveBeenCalledOnce()
  })

  it('Ctrl+K calls onProjectSearch', () => {
    const { onProjectSearch } = setup()
    fireKey('k', { ctrlKey: true })
    expect(onProjectSearch).toHaveBeenCalledOnce()
  })

  it('Space calls onToggleTimer', () => {
    const { onToggleTimer } = setup()
    fireKey(' ')
    expect(onToggleTimer).toHaveBeenCalledOnce()
  })

  it('T key navigates to today', () => {
    useDashboardStore.setState({ selectedDate: '2025-01-01' })
    setup()
    fireKey('t')
    expect(useDashboardStore.getState().selectedDate).toBe(toDateKey(new Date()))
  })

  it('ArrowLeft moves selected date back one day', () => {
    setup()
    fireKey('ArrowLeft')
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-26')
  })

  it('ArrowRight moves selected date forward one day', () => {
    setup()
    fireKey('ArrowRight')
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-28')
  })

  it('does not navigate when typing in a text input', () => {
    setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })
    document.dispatchEvent(event)
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-27')
    document.body.removeChild(input)
  })

  it('does not call handlers when Ctrl modifier is held for arrow keys', () => {
    const { onAddEntry } = setup()
    fireKey('ArrowLeft', { ctrlKey: true })
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-27')
    expect(onAddEntry).not.toHaveBeenCalled()
  })

  it('cleans up the event listener on unmount', () => {
    const { onAddEntry, unmount } = setup()
    unmount()
    fireKey('n', { ctrlKey: true })
    expect(onAddEntry).not.toHaveBeenCalled()
  })
})
