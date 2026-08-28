import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import { renderWithProviders, resetAppState, signIn } from '@/test/harness'
import { CalendarPage } from './calendar-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('CalendarPage', () => {
  test('renders the Calendar heading', async () => {
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByRole('heading', { name: /calendar/i })).toBeInTheDocument()
  })

  test('shows month and year in subtitle', async () => {
    renderWithProviders(<CalendarPage />)
    const now = new Date()
    const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    expect(await screen.findByText(monthYear)).toBeInTheDocument()
  })

  test('renders day buttons for the calendar grid', async () => {
    renderWithProviders(<CalendarPage />)
    await screen.findByRole('heading', { name: /calendar/i })
    const dayButtons = screen.getAllByRole('button')
    expect(dayButtons.length).toBeGreaterThanOrEqual(28)
  })

  test('clicking a day navigates to dashboard', async () => {
    renderWithProviders(<CalendarPage />)
    await screen.findByRole('heading', { name: /calendar/i })
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(useNavigationStore.getState().view).toBe('dashboard')
  })

  test('shows Tracked time per day card', async () => {
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByText('Tracked time per day')).toBeInTheDocument()
  })
})
