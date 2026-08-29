import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import {
  atTime,
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { useTimerStore } from '@/features/timer/timer-store'
import { DashboardPage } from './dashboard-page'
import { useDashboardStore } from './dashboard-store'

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
  useDashboardStore.setState({ selectedDate: '2026-08-27' })
})

describe('DashboardPage', () => {
  it('renders the dashboard heading', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows KPI cards section', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Tracked Today')).toBeInTheDocument())
    expect(screen.getByText('Weekly Total')).toBeInTheDocument()
  })

  it('shows Currently Tracking region', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Currently Tracking' })).toBeInTheDocument(),
    )
  })

  it('shows date navigation', () => {
    renderWithProviders(<DashboardPage />)
    expect(screen.getByLabelText('Previous day')).toBeInTheDocument()
    expect(screen.getByLabelText('Next day')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })

  it('shows today entries card', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: "Today's Entries" })).toBeInTheDocument(),
    )
  })

  it('shows tracked time in KPI card after seeding an entry', async () => {
    const project = await seedProject('Website')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 11),
    })

    renderWithProviders(<DashboardPage />)
    // 120 minutes = 2h 00m
    await waitFor(() => expect(screen.getAllByText('2h 00m').length).toBeGreaterThanOrEqual(1))
  })

  it('shows the project in Today Entries when there is a time entry', async () => {
    const project = await seedProject('Website')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 10),
    })

    renderWithProviders(<DashboardPage />)
    await waitFor(() => expect(screen.getAllByText('Website').length).toBeGreaterThanOrEqual(1))
  })
})

describe('DashboardPage – keyboard shortcuts', () => {
  it('Ctrl+N opens the time entry dialog', async () => {
    await seedProject('Website')
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByRole('heading', { name: 'Dashboard' }))

    fireKey('n', { ctrlKey: true })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('Ctrl+K opens the project picker search', async () => {
    await seedProject('Website')
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByRole('button', { name: /Start timer/i }))

    fireKey('k', { ctrlKey: true })

    await waitFor(() => expect(screen.getByLabelText('Search projects')).toBeInTheDocument())
  })

  it('Space key opens picker when no timer is running', async () => {
    await seedProject('Website')
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByRole('button', { name: /Start timer/i }))

    fireKey(' ')

    await waitFor(() => expect(screen.getByLabelText('Search projects')).toBeInTheDocument())
  })

  it('Space key stops the timer when it is running', async () => {
    const project = await seedProject('Website')
    await seedTimeEntry({
      projectId: project.id,
      startTime: new Date(Date.now() - 60_000),
      endTime: null,
    })
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 0, paused: false } })

    renderWithProviders(<DashboardPage />)
    await waitFor(() => expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument())

    fireKey(' ')

    await waitFor(() =>
      expect(screen.queryByLabelText('Elapsed time')).not.toBeInTheDocument(),
    )
    expect(useTimerStore.getState().session).toBeNull()
  })

  it('Space key resumes the timer when it is paused', async () => {
    const project = await seedProject('Website')
    useTimerStore.setState({ session: { projectId: project.id, carriedMs: 60_000, paused: true } })

    renderWithProviders(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('Paused')).toBeInTheDocument())

    fireKey(' ')

    await waitFor(() => expect(screen.queryByText('Paused')).not.toBeInTheDocument())
  })
})

describe('DashboardPage – dialog interactions', () => {
  it('clicking Add entry in empty entries card opens the time entry dialog', async () => {
    await seedProject('Website')
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('No time tracked today'))

    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking Start timer in empty entries card opens the project picker', async () => {
    await seedProject('Website')
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('No time tracked today'))

    // There are multiple "Start timer" buttons; pick the one in the entries empty state
    const startButtons = screen.getAllByRole('button', { name: /Start timer/i })
    fireEvent.click(startButtons[startButtons.length - 1])

    await waitFor(() => expect(screen.getByLabelText('Search projects')).toBeInTheDocument())
  })

  it('clicking Create project in empty project card opens the project dialog', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Create your first project to start tracking.'))

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(screen.getByRole('dialog', { name: /project/i })).toBeInTheDocument()
  })
})

describe('DashboardPage – navigation callbacks', () => {
  it('clicking One Day in Overtime Overview navigates to time-entries', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Overtime Overview'))

    fireEvent.click(screen.getByRole('button', { name: /One Day/i }))

    expect(useNavigationStore.getState().view).toBe('time-entries')
  })

  it('clicking One Week in Overtime Overview navigates to reports', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Overtime Overview'))

    fireEvent.click(screen.getByRole('button', { name: /One Week/i }))

    expect(useNavigationStore.getState().view).toBe('reports')
  })

  it('clicking View all in Recent Projects navigates to projects', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Recent Projects'))

    fireEvent.click(screen.getByRole('button', { name: /View all/i }))

    expect(useNavigationStore.getState().view).toBe('projects')
  })

  it('clicking Weekly Summary navigates to week', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Weekly Summary'))

    // The Weekly Summary button is the one containing "compared with the previous period"
    const comparisonText = screen.getByText(/compared with the previous period/i)
    const summaryButton = comparisonText.closest('button') as HTMLElement
    fireEvent.click(summaryButton)

    expect(useNavigationStore.getState().view).toBe('week')
  })

  it('clicking a project in Recent Projects navigates to time-entries', async () => {
    const project = await seedProject('Website')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })

    renderWithProviders(<DashboardPage />)
    await waitFor(() => screen.getByText('Recent Projects'))

    // The project buttons are inside a <ul> in the Recent Projects card
    const recentHeader = screen.getByText('Recent Projects')
    const recentCard = recentHeader.closest('div[class*="rounded-xl"]') as HTMLElement
    // Wait for the project entry to appear
    await waitFor(() => expect(recentCard.querySelector('ul')).not.toBeNull())
    const projectList = recentCard.querySelector('ul') as HTMLElement
    const projectButton = within(projectList).getAllByRole('button')[0]
    fireEvent.click(projectButton)

    expect(useNavigationStore.getState().view).toBe('time-entries')
  })
})
