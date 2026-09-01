import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DUPLICATE_OVERTIME_MESSAGE } from '@/features/overtime/overtime-schema'
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
import { OvertimePage } from './overtime-page'

const TODAY = toDateKey(new Date())

/** The dialog and the page both offer a "Set overtime" button, so it is scoped. */
function overtimeForm() {
  return within(screen.getByRole('dialog'))
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('OvertimePage', () => {
  it('explains the empty state before any explicit record', async () => {
    renderWithProviders(<OvertimePage />)

    expect(await screen.findByText(/no explicit overtime yet/i)).toBeInTheDocument()
  })

  it('shows the balance split into the automatic and the manual part', async () => {
    const project = await seedProject('Alpha')
    const now = new Date()
    await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(now, 8),
      endTime: atTime(now, 9),
    })
    await seedOvertimeEntry({ effectiveDate: TODAY, minutes: 120, kind: 'adjustment' })
    renderWithProviders(<OvertimePage />)

    await waitFor(() =>
      expect(screen.getByTestId('overtime-manual')).toHaveTextContent('+2h 00m'),
    )
    expect(screen.getByTestId('overtime-automatic')).toBeInTheDocument()
    expect(screen.getByTestId('overtime-balance')).toBeInTheDocument()
  })

  it('saves an explicit record entered in hours and minutes', async () => {
    renderWithProviders(<OvertimePage />)
    fireEvent.click(await screen.findByRole('button', { name: /set overtime/i }))
    fireEvent.change(overtimeForm().getByLabelText(/^overtime$/i), {
      target: { value: '1h 30m' },
    })
    fireEvent.click(overtimeForm().getByRole('button', { name: /^set overtime$/i }))

    await waitFor(() =>
      expect(screen.getByTestId('overtime-manual')).toHaveTextContent('+1h 30m'),
    )
    expect(within(screen.getByTestId('overtime-records')).getByText('+1h 30m')).toBeInTheDocument()
  })

  it('reports an unparsable value without saving it', async () => {
    renderWithProviders(<OvertimePage />)
    fireEvent.click(await screen.findByRole('button', { name: /set overtime/i }))
    fireEvent.change(overtimeForm().getByLabelText(/^overtime$/i), { target: { value: 'a lot' } })
    fireEvent.click(overtimeForm().getByRole('button', { name: /^set overtime$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a duration/i)
    expect(screen.queryByTestId('overtime-records')).not.toBeInTheDocument()
  })

  it('rejects a second record on the same date', async () => {
    await seedOvertimeEntry({ effectiveDate: TODAY, minutes: 60, kind: 'balance' })
    renderWithProviders(<OvertimePage />)
    fireEvent.click(await screen.findByRole('button', { name: /set overtime/i }))
    fireEvent.change(overtimeForm().getByLabelText(/^overtime$/i), { target: { value: '30m' } })
    fireEvent.click(overtimeForm().getByRole('button', { name: /^set overtime$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(DUPLICATE_OVERTIME_MESSAGE)
  })

  it('filters the list by origin and labels it as text', async () => {
    await seedOvertimeEntry({ effectiveDate: TODAY, minutes: 60, kind: 'balance' })
    await seedOvertimeEntry({
      effectiveDate: '2026-01-02',
      minutes: 30,
      kind: 'adjustment',
      origin: 'automatic',
    })
    renderWithProviders(<OvertimePage />)

    const list = within(await screen.findByTestId('overtime-records'))
    expect(list.getByText('Manual')).toBeInTheDocument()
    expect(list.getByText('Automatic')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/filter by origin/i), { target: { value: 'manual' } })
    await waitFor(() =>
      expect(
        within(screen.getByTestId('overtime-records')).queryByText('Automatic'),
      ).not.toBeInTheDocument(),
    )
  })

  it('deletes a record after confirmation', async () => {
    await seedOvertimeEntry({ effectiveDate: TODAY, minutes: 60, kind: 'balance' })
    renderWithProviders(<OvertimePage />)
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(`delete overtime on ${TODAY}`, 'i') }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /^delete record$/i }))

    await waitFor(() => expect(screen.getByTestId('overtime-manual')).toHaveTextContent('+0h 00m'))
  })
})
