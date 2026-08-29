import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { renderWithProviders, resetAppState, signIn } from '@/test/harness'
import { ReportsPage } from './reports-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('ReportsPage', () => {
  test('renders the Reports heading', async () => {
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByRole('heading', { name: /reports/i })).toBeInTheDocument()
  })

  test('shows the week range in the subtitle', async () => {
    renderWithProviders(<ReportsPage />)
    await screen.findByRole('heading', { name: /reports/i })
    // formatWeekRange returns something like "Mon, Jan 1 – Sun, Jan 7"
    expect(screen.getByText(/week of/i)).toBeInTheDocument()
  })

  test('shows tracked hours per day card', async () => {
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByText('Tracked hours per day')).toBeInTheDocument()
  })

  test('shows projects this week card', async () => {
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByText('Projects this week')).toBeInTheDocument()
  })

  test('shows empty state for projects when no time tracked', async () => {
    renderWithProviders(<ReportsPage />)
    expect(await screen.findByText('No time tracked this week.')).toBeInTheDocument()
  })

  test('shows total, target and overtime in report summary', async () => {
    renderWithProviders(<ReportsPage />)
    await screen.findByText('Tracked hours per day')
    expect(screen.getByText(/total:/i)).toBeInTheDocument()
    expect(screen.getByText(/target:/i)).toBeInTheDocument()
    expect(screen.getByText(/overtime:/i)).toBeInTheDocument()
  })
})
