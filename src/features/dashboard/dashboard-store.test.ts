import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toDateKey } from '@/lib/date'
import { useDashboardStore, useSelectedDate } from './dashboard-store'

beforeEach(() => {
  useDashboardStore.setState({ selectedDate: toDateKey(new Date()) })
})

describe('useDashboardStore', () => {
  it('defaults to today', () => {
    const { selectedDate } = useDashboardStore.getState()
    expect(selectedDate).toBe(toDateKey(new Date()))
  })

  it('sets an explicit date', () => {
    useDashboardStore.getState().setSelectedDate('2026-08-15')
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-15')
  })

  it('shifts the selected date forward and backward', () => {
    useDashboardStore.getState().setSelectedDate('2026-08-27')
    useDashboardStore.getState().shiftSelectedDate(1)
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-28')
    useDashboardStore.getState().shiftSelectedDate(-2)
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-26')
  })

  it('goToToday resets to the current date', () => {
    useDashboardStore.getState().setSelectedDate('2025-01-01')
    useDashboardStore.getState().goToToday()
    expect(useDashboardStore.getState().selectedDate).toBe(toDateKey(new Date()))
  })

  it('shiftSelectedDate crosses month boundaries correctly', () => {
    useDashboardStore.getState().setSelectedDate('2026-08-31')
    useDashboardStore.getState().shiftSelectedDate(1)
    expect(useDashboardStore.getState().selectedDate).toBe('2026-09-01')
  })
})
