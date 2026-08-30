import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDashboardStore } from '@/features/dashboard/dashboard-store'
import {
  atTime,
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { WeekPage } from './week-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
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
})
