import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboardStore } from '@/features/dashboard/dashboard-store'
import { useToastStore } from '@/components/ui/toast-store'
import { toDateKey } from '@/lib/date'
import {
  atTime,
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { WeekPage } from './week-page'

/** jsdom has no layout, so the scroll of the day breakdown is only recorded. */
const scrollIntoView = vi.fn()
Element.prototype.scrollIntoView = scrollIntoView

/** The quick-add buttons stay disabled until the project list has loaded. */
async function selectQuickAddProject(projectId: number) {
  const select = await screen.findByRole('combobox', { name: 'Quick add project' })
  await screen.findByRole('option', { name: 'Alpha' })
  fireEvent.change(select, { target: { value: String(projectId) } })
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
  scrollIntoView.mockClear()
  useDashboardStore.setState({ selectedDate: '2026-08-27' })
})

describe('WeekPage', () => {
  it('renders week KPIs for a seeded week', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })

    renderWithProviders(<WeekPage />)

    expect(await screen.findByRole('heading', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByText('Tracked this week')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('1h 00m').length).toBeGreaterThanOrEqual(2))
  })

  it('marks untracked working days and non-working days in the breakdown', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })

    renderWithProviders(<WeekPage />)

    expect((await screen.findAllByText('Not tracked')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Non-working day').length).toBe(2)
  })

  it('shows the cumulative balance across weeks', async () => {
    const project = await seedProject('Alpha')
    const earlier = new Date(2026, 7, 20)
    await seedTimeEntry({ projectId: project.id, startTime: atTime(earlier, 9), endTime: atTime(earlier, 10) })

    renderWithProviders(<WeekPage />)

    expect(await screen.findByText('Cumulative balance')).toBeInTheDocument()
    expect(await screen.findByText(/Carried across all weeks since August 20, 2026/)).toBeInTheDocument()
  })

  it('week navigation updates range and month section', async () => {
    renderWithProviders(<WeekPage />)

    expect(await screen.findByText(/KW /)).toBeInTheDocument()
    expect(screen.getByText(/August 2026 – month to date/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))

    await waitFor(() =>
      expect(screen.getByText(/September 2026 – month to date/)).toBeInTheDocument(),
    )
  })

  it('adding and deleting an entry updates week and month totals', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date(2026, 7, 27)
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })

    renderWithProviders(<WeekPage />)
    await waitFor(() => expect(screen.getAllByText('1h 00m').length).toBeGreaterThanOrEqual(2))

    fireEvent.change(screen.getByRole('combobox', { name: 'Quick add project' }), {
      target: { value: String(project.id) },
    })
    fireEvent.click(screen.getByRole('button', { name: /15 min/i }))

    await waitFor(() => expect(screen.getAllByText('1h 15m').length).toBeGreaterThanOrEqual(2))

    fireEvent.click(screen.getAllByLabelText(/Actions for Alpha/i)[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }))

    await waitFor(() => expect(screen.queryByText('1h 15m')).not.toBeInTheDocument())
  })

  it('month section is read-only and exposes no edit controls', async () => {
    renderWithProviders(<WeekPage />)
    const monthHeading = await screen.findByText(/month to date/)
    const monthSection = monthHeading.closest('div.rounded-xl') as HTMLElement

    expect(within(monthSection).queryByRole('button', { name: /Add entry/i })).not.toBeInTheDocument()
    expect(within(monthSection).queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument()
    expect(within(monthSection).queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument()
  })

  it('steps back a week and returns to the current one', async () => {
    renderWithProviders(<WeekPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Previous week' }))

    await waitFor(() => expect(useDashboardStore.getState().selectedDate).toBe('2026-08-20'))

    fireEvent.click(screen.getByRole('button', { name: 'This week' }))

    await waitFor(() =>
      expect(useDashboardStore.getState().selectedDate).toBe(toDateKey(new Date())),
    )
  })

  it('selects a week of the overview list', async () => {
    renderWithProviders(<WeekPage />)
    const weeks = (await screen.findByText('Weeks in month')).parentElement as HTMLElement
    fireEvent.click(within(weeks).getAllByRole('button')[0]!)

    await waitFor(() => expect(useDashboardStore.getState().selectedDate).not.toBe('2026-08-27'))
  })

  it('scrolls to the day picked in the breakdown', async () => {
    renderWithProviders(<WeekPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Thu, 27/ }))

    await waitFor(() =>
      expect(screen.getByLabelText('Selected quick-add day')).toHaveValue('2026-08-27'),
    )
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('books a full day and a custom duration on the picked day', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<WeekPage />)
    await selectQuickAddProject(project.id)
    fireEvent.change(screen.getByLabelText('Selected quick-add day'), {
      target: { value: '2026-08-26' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^1 day$/i }))

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Time added'))

    fireEvent.change(screen.getByLabelText('Quick add custom duration'), {
      target: { value: '1h 30m' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(screen.getByLabelText('Quick add custom duration')).toHaveValue(''))
    expect(screen.getAllByText('9h 30m').length).toBeGreaterThanOrEqual(1)
  })

  it('reports an unparsable custom duration without booking it', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<WeekPage />)
    await selectQuickAddProject(project.id)
    fireEvent.change(screen.getByLabelText('Quick add custom duration'), {
      target: { value: 'a while' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Invalid duration'))
    expect(screen.getByLabelText('Quick add custom duration')).toHaveValue('a while')
  })

  it('opens the entry dialog prefilled with the day it was started from', async () => {
    renderWithProviders(<WeekPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Add entry/i }))[0]!)

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByLabelText(/date/i)).toHaveValue('2026-08-24')
  })
})
