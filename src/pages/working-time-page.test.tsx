import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { localRepository } from '@/features/storage/local-repository'
import {
  atTime,
  renderWithProviders,
  resetAppState,
  seedBreak,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { WorkingTimePage } from './working-time-page'

const TODAY = new Date()

async function seedLongDayWithoutBreak() {
  const project = await seedProject('Website Redesign')
  await seedTimeEntry({
    projectId: project.id,
    startTime: atTime(TODAY, 7),
    endTime: atTime(TODAY, 18),
  })
  return project
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('WorkingTimePage', () => {
  test('reports no issue for a compliant day', async () => {
    const project = await seedProject('Website Redesign')
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(TODAY, 8),
      endTime: atTime(TODAY, 12),
    })
    await seedBreak({ startTime: atTime(TODAY, 12), endTime: atTime(TODAY, 12, 30) })
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(TODAY, 12, 30),
      endTime: atTime(TODAY, 16),
    })

    renderWithProviders(<WorkingTimePage />)

    expect(await screen.findByText(/no break, daily maximum or rest period issues/i)).toBeVisible()
  })

  test('warns about a missing break and the daily maximum without hiding the record', async () => {
    await seedLongDayWithoutBreak()

    renderWithProviders(<WorkingTimePage />)

    expect(await screen.findByText(/at least 0h 45m are required/i)).toBeVisible()
    expect(screen.getByText(/the daily maximum is 10h 00m/i)).toBeVisible()
    expect(screen.getByText('07:00')).toBeVisible()
    expect(screen.getByText('18:00')).toBeVisible()
  })

  test('offers the monthly record as CSV and PDF', async () => {
    await seedLongDayWithoutBreak()
    const createObjectURL = vi.fn(() => 'blob:record')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    renderWithProviders(<WorkingTimePage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    fireEvent.click(screen.getByRole('button', { name: /export pdf/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  test('shows the audit trail of an edited entry', async () => {
    const project = await seedProject('Website Redesign')
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(TODAY, 9),
      endTime: atTime(TODAY, 12),
    })
    await localRepository.updateTimeEntryNote(entry.id, 'Corrected')

    renderWithProviders(<WorkingTimePage />)

    await waitFor(() => expect(screen.getByText('updated')).toBeVisible())
    expect(screen.getAllByText(/tester@example.com/).length).toBeGreaterThan(0)
    expect(screen.getByText('created')).toBeVisible()
    expect(screen.getByText(/note: — → Corrected/)).toBeVisible()
  })
})
