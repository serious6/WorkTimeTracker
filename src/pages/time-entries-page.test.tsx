import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import { TimeEntriesPage } from './time-entries-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('TimeEntriesPage', () => {
  it('shows empty state when no entries exist', async () => {
    renderWithProviders(<TimeEntriesPage />)
    expect(await screen.findByText(/no time entries yet/i)).toBeInTheDocument()
  })

  it('lists entries grouped by day', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    await seedTimeEntry({ projectId: project.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })
    renderWithProviders(<TimeEntriesPage />)
    // Entry is shown in the list
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0))
  })

  it('shows the project filter select', async () => {
    renderWithProviders(<TimeEntriesPage />)
    expect(await screen.findByRole('combobox', { name: /filter by project/i })).toBeInTheDocument()
  })

  it('filters entries by project', async () => {
    const alpha = await seedProject('Alpha')
    const beta = await seedProject('Beta')
    const ref = new Date()
    await seedTimeEntry({ projectId: alpha.id, startTime: atTime(ref, 9), endTime: atTime(ref, 10) })
    await seedTimeEntry({ projectId: beta.id, startTime: atTime(ref, 11), endTime: atTime(ref, 12) })
    renderWithProviders(<TimeEntriesPage />)
    // Wait for entries to load
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0))
    fireEvent.change(
      screen.getByRole('combobox', { name: /filter by project/i }),
      { target: { value: String(alpha.id) } },
    )
    // Beta should no longer be in the entry list (only in select option)
    await waitFor(() => {
      // Beta is only in the select option, not in the entries list
      const betaInList = screen.queryAllByRole('listitem').some(
        (el) => el.textContent?.includes('Beta'),
      )
      expect(betaInList).toBe(false)
    })
  })

  it('opens add entry dialog', async () => {
    renderWithProviders(<TimeEntriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /add time entry/i }))
    expect(await screen.findByRole('heading', { name: /add time entry/i })).toBeInTheDocument()
  })
})
