import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MAX_LIST_LIMIT } from '@/features/storage/list-range'
import { createLocalRepository } from '@/features/storage/local-repository'
import { toDateKey } from '@/lib/date'
import {
  atTime,
  renderWithProviders,
  resetAppState,
  seedOvertimeEntry,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { AuditTrailsPage } from './audit-trails-page'

const STATE_KEYS = ['time-entry-state', 'absence-state', 'overtime-state'] as const

/** The audit rows, without the type names of the filter checkboxes. */
function records() {
  return within(screen.getByTestId('audit-records'))
}

/** Seeds one recorded change per audit trail. */
async function seedEveryTrail(): Promise<void> {
  const project = await seedProject('Alpha')
  const today = new Date()
  await seedTimeEntry({
    projectId: project.id,
    startTime: atTime(today, 9),
    endTime: atTime(today, 10),
  })
  await createLocalRepository().createAbsence({ type: 'vacation', date: toDateKey(today) })
  await seedOvertimeEntry({ effectiveDate: toDateKey(today), minutes: 60, kind: 'adjustment' })
}

/** Moves every recorded change of the user back in time, as an older trail. */
function ageAudits(userId: number, recordedAt: string): void {
  for (const key of STATE_KEYS) {
    const storageKey = `work-time-tracker.${userId}.${key}`
    const raw = globalThis.localStorage.getItem(storageKey)
    if (!raw) continue
    const state = JSON.parse(raw) as { audits: { recordedAt: string }[] }
    state.audits = state.audits.map((audit) => ({ ...audit, recordedAt }))
    globalThis.localStorage.setItem(storageKey, JSON.stringify(state))
  }
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await resetAppState()
  await signIn()
})

describe('AuditTrailsPage', () => {
  test('renders the Audit Trails heading', async () => {
    renderWithProviders(<AuditTrailsPage />)
    expect(await screen.findByRole('heading', { name: 'Audit Trails' })).toBeInTheDocument()
  })

  test('explains the empty state without any recorded change', async () => {
    renderWithProviders(<AuditTrailsPage />)
    expect(
      await screen.findByText('No audit records for the selected filters.'),
    ).toBeInTheDocument()
  })

  test('shows the type, action, actor and summary of every trail', async () => {
    await seedEveryTrail()
    renderWithProviders(<AuditTrailsPage />)

    await waitFor(() => expect(records().getAllByRole('listitem').length).toBeGreaterThan(2))
    expect(records().getByText('Time Entry')).toBeInTheDocument()
    expect(records().getByText('Absence')).toBeInTheDocument()
    expect(records().getByText('Overtime')).toBeInTheDocument()
    expect(records().getAllByText('Created').length).toBe(3)
    expect(records().getAllByText(/tester@example\.com/).length).toBe(3)
  })

  test('offers no action that changes a record', async () => {
    await seedEveryTrail()
    renderWithProviders(<AuditTrailsPage />)

    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(3))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('reads the last 7 days by default and hides older records', async () => {
    const user = await signIn('older@example.com')
    await seedEveryTrail()
    ageAudits(user.id, daysAgo(10))
    renderWithProviders(<AuditTrailsPage />)

    expect(
      await screen.findByText('No audit records for the selected filters.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Period')).toHaveValue('last7')
  })

  test.each([
    ['last14', 3],
    ['always', 3],
    ['today', 0],
    ['last3', 0],
  ])('reads the records of the %s window', async (option, expected) => {
    const user = await signIn(`range-${option}@example.com`)
    await seedEveryTrail()
    ageAudits(user.id, daysAgo(10))
    renderWithProviders(<AuditTrailsPage />)
    await screen.findByRole('heading', { name: 'Audit Trails' })

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: option } })

    if (expected === 0) {
      expect(
        await screen.findByText('No audit records for the selected filters.'),
      ).toBeInTheDocument()
    } else {
      await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(expected))
    }
  })

  test('keeps the type filters when the window changes', async () => {
    await seedEveryTrail()
    renderWithProviders(<AuditTrailsPage />)
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(3))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Absence' }))
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'always' } })

    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(1))
    expect(screen.getByRole('checkbox', { name: 'Absence' })).toBeChecked()
    expect(records().getByText('Absence')).toBeInTheDocument()
  })

  test('filters on a single type and on several types at once', async () => {
    await seedEveryTrail()
    renderWithProviders(<AuditTrailsPage />)
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(3))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Overtime' }))
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(1))
    expect(records().getByText('Overtime')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Absence' }))
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(2))
    expect(records().queryByText('Time Entry')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Overtime' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Absence' }))
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(3))
  })

  test('shows an empty state when a type filter matches nothing', async () => {
    await createLocalRepository().createAbsence({ type: 'vacation', date: toDateKey(new Date()) })
    renderWithProviders(<AuditTrailsPage />)
    await waitFor(() => expect(records().getAllByRole('listitem').length).toBe(1))

    fireEvent.click(screen.getByRole('checkbox', { name: 'Overtime' }))

    expect(
      await screen.findByText('No audit records for the selected filters.'),
    ).toBeInTheDocument()
  })

  test('reads every page of a trail that exceeds one page in the always window', async () => {
    // A backend answers at most one page, so the oldest record only shows up
    // once the view asks for the records before the page it already read.
    const oldest = {
      id: MAX_LIST_LIMIT + 1,
      overtimeEntryId: 1,
      action: 'created' as const,
      actor: 'pager@example.com',
      oldValue: null,
      newValue: JSON.stringify({
        effectiveDate: '2020-01-02',
        minutes: 60,
        kind: 'adjustment',
        origin: 'manual',
        note: null,
      }),
      recordedAt: '2020-01-02T00:00:00.000Z',
    }
    // The first page ends inside a pair of records of the same instant, the
    // collision the page bound has to survive.
    const trail = [
      ...Array.from({ length: MAX_LIST_LIMIT }, (_, index) => ({
        ...oldest,
        id: MAX_LIST_LIMIT - index,
        // The two oldest rows of the page share their instant.
        recordedAt: new Date(
          Date.UTC(2020, 0, 3) + Math.max(MAX_LIST_LIMIT - index, 2) * 60_000,
        ).toISOString(),
      })),
      oldest,
    ]
    const asked: (string | undefined)[] = []
    vi.spyOn(createLocalRepository(), 'listOvertimeAudits').mockImplementation(async (range) => {
      asked.push(range?.to)
      const before = range?.to ? trail.filter((audit) => audit.recordedAt < range.to!) : trail
      return before.slice(0, range?.limit ?? MAX_LIST_LIMIT)
    })

    renderWithProviders(<AuditTrailsPage />)
    await screen.findByRole('heading', { name: 'Audit Trails' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Overtime' }))
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'always' } })

    await waitFor(() => expect(asked.length).toBeGreaterThan(1))
    await waitFor(() =>
      expect(records().getAllByRole('listitem').length).toBe(MAX_LIST_LIMIT + 1),
    )
  }, 30_000)

  test('shows a load error instead of the empty state', async () => {
    vi.spyOn(createLocalRepository(), 'listTimeEntryAudits').mockRejectedValueOnce(
      new Error('unavailable'),
    )

    renderWithProviders(<AuditTrailsPage />)

    expect(await screen.findByText(/audit trails could not be loaded/i)).toBeInTheDocument()
    expect(
      screen.queryByText('No audit records for the selected filters.'),
    ).not.toBeInTheDocument()
  })

  test('shows a load error when the projects cannot be read', async () => {
    vi.spyOn(createLocalRepository(), 'listProjects').mockRejectedValueOnce(
      new Error('unavailable'),
    )

    renderWithProviders(<AuditTrailsPage />)

    expect(await screen.findByText(/audit trails could not be loaded/i)).toBeInTheDocument()
  })

  test('waits for the trails instead of announcing an empty result', async () => {
    let release = () => {}
    const pending = new Promise<never[]>((resolve) => {
      release = () => resolve([])
    })
    vi.spyOn(createLocalRepository(), 'listAbsenceAudits').mockReturnValueOnce(pending)

    renderWithProviders(<AuditTrailsPage />)

    expect(await screen.findByText('Loading the audit trails…')).toBeInTheDocument()
    expect(
      screen.queryByText('No audit records for the selected filters.'),
    ).not.toBeInTheDocument()

    release()
    expect(
      await screen.findByText('No audit records for the selected filters.'),
    ).toBeInTheDocument()
  })

  test('never shows the records of another user', async () => {
    await seedEveryTrail()
    await createLocalRepository().logout()
    await signIn('second@example.com')

    renderWithProviders(<AuditTrailsPage />)

    expect(
      await screen.findByText('No audit records for the selected filters.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/tester@example\.com/)).not.toBeInTheDocument()
  })
})
