import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { toDateKey } from '@/lib/date'
import { useDashboardStore } from '../dashboard-store'
import { DateNavigation } from './date-navigation'

beforeEach(() => {
  useDashboardStore.setState({ selectedDate: '2026-08-27' })
})

describe('DateNavigation', () => {
  it('shows the current selected date in the input', () => {
    render(<DateNavigation />)
    const input = screen.getByLabelText('Selected date') as HTMLInputElement
    expect(input.value).toBe('2026-08-27')
  })

  it('Previous day button moves the date back', () => {
    render(<DateNavigation />)
    fireEvent.click(screen.getByLabelText('Previous day'))
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-26')
  })

  it('Next day button moves the date forward', () => {
    render(<DateNavigation />)
    fireEvent.click(screen.getByLabelText('Next day'))
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-28')
  })

  it('Today button resets the date to today', () => {
    useDashboardStore.setState({ selectedDate: '2025-01-01' })
    render(<DateNavigation />)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(useDashboardStore.getState().selectedDate).toBe(toDateKey(new Date()))
  })

  it('typing a date in the input updates the store', () => {
    render(<DateNavigation />)
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '2026-09-01' } })
    expect(useDashboardStore.getState().selectedDate).toBe('2026-09-01')
  })

  it('typing an empty string in the input does not update the store', () => {
    render(<DateNavigation />)
    fireEvent.change(screen.getByLabelText('Selected date'), { target: { value: '' } })
    expect(useDashboardStore.getState().selectedDate).toBe('2026-08-27')
  })
})
