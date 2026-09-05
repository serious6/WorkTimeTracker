import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalRepository } from '@/features/storage/local-repository'
import { renderWithProviders, resetAppState, seedAbsence, signIn } from '@/test/harness'
import { AbsencesPage } from './absences-page'

/** Fixed working days of a week that the default schedule counts, plus one Saturday. */
const TUESDAY = '2026-09-01'
const WEDNESDAY = '2026-09-02'
const SATURDAY = '2026-09-05'

/** The page and the dialog both offer a "Mark absence" button, so it is scoped. */
function absenceForm() {
  return within(screen.getByRole('dialog'))
}

async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: /^mark absence$/i }))
  return absenceForm()
}

/** The type labels also appear as options, so assertions wait for the close. */
async function waitForDialogToClose() {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('AbsencesPage', () => {
  it('explains both empty states before anything is recorded', async () => {
    renderWithProviders(<AbsencesPage />)

    expect(await screen.findByText(/no absences yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no changes recorded yet/i)).toBeInTheDocument()
  })

  it('lists absences newest first and reports the neutralised target', async () => {
    await seedAbsence({ type: 'vacation', date: TUESDAY })
    await seedAbsence({ type: 'halfDay', date: WEDNESDAY })
    await seedAbsence({ type: 'sick', date: SATURDAY })
    renderWithProviders(<AbsencesPage />)

    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]!).getByText('Sick leave')).toBeInTheDocument()
    expect(within(items[0]!).getByText('no working day')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Half day')).toBeInTheDocument()
    expect(within(items[1]!).getByText(/8h 00m → 4h 00m/)).toBeInTheDocument()
    expect(screen.getByText(/3 days recorded, 12h 00m of target neutralised/)).toBeInTheDocument()
  })

  it('marks a range of days as one absence per day', async () => {
    renderWithProviders(<AbsencesPage />)
    const form = await openDialog()
    fireEvent.change(form.getByLabelText(/absence type/i), { target: { value: 'vacation' } })
    fireEvent.change(form.getByLabelText(/first day/i), { target: { value: TUESDAY } })
    fireEvent.change(form.getByLabelText(/last day/i), { target: { value: WEDNESDAY } })
    fireEvent.click(form.getByRole('button', { name: /^mark absence$/i }))

    await waitForDialogToClose()
    expect(await screen.findByText(/2 days recorded/)).toBeInTheDocument()
    expect(screen.getAllByText('Vacation')).toHaveLength(2)
  })

  it('reports a missing absence type without saving', async () => {
    renderWithProviders(<AbsencesPage />)
    const form = await openDialog()
    fireEvent.change(form.getByLabelText(/first day/i), { target: { value: TUESDAY } })
    fireEvent.click(form.getByRole('button', { name: /^mark absence$/i }))

    expect(
      await absenceForm().findByText(/select an absence type/i, { selector: 'p' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no absences yet/i)).toBeInTheDocument()
  })

  it('replaces a day that already carries an absence only after confirmation', async () => {
    await seedAbsence({ type: 'vacation', date: TUESDAY })
    renderWithProviders(<AbsencesPage />)
    const form = await openDialog()
    fireEvent.change(form.getByLabelText(/absence type/i), { target: { value: 'sick' } })
    fireEvent.change(form.getByLabelText(/first day/i), { target: { value: TUESDAY } })
    fireEvent.change(form.getByLabelText(/last day/i), { target: { value: TUESDAY } })
    fireEvent.click(form.getByRole('button', { name: /^mark absence$/i }))

    expect(await absenceForm().findByText(/1 day already carries an absence/i)).toBeInTheDocument()
    fireEvent.click(absenceForm().getByRole('button', { name: /replace existing absences/i }))
    fireEvent.click(absenceForm().getByRole('button', { name: /^mark absence$/i }))

    await waitForDialogToClose()
    expect(screen.getByText('Sick leave')).toBeInTheDocument()
    expect(screen.getByText(/1 day recorded/)).toBeInTheDocument()
  })

  it('edits the type of a recorded absence', async () => {
    await seedAbsence({ type: 'vacation', date: TUESDAY })
    renderWithProviders(<AbsencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: `Edit absence on ${TUESDAY}` }))
    const form = absenceForm()
    fireEvent.change(form.getByLabelText(/absence type/i), { target: { value: 'unpaid' } })
    fireEvent.click(form.getByRole('button', { name: /^save absence$/i }))

    await waitForDialogToClose()
    expect(screen.getByText('Unpaid leave')).toBeInTheDocument()
    expect(screen.getByText(/1 day recorded/)).toBeInTheDocument()
  })

  it('deletes an absence after confirmation', async () => {
    await seedAbsence({ type: 'vacation', date: TUESDAY })
    renderWithProviders(<AbsencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: `Delete absence on ${TUESDAY}` }))
    fireEvent.click(await screen.findByRole('button', { name: /^delete absence$/i }))

    expect(await screen.findByText(/no absences yet/i)).toBeInTheDocument()
  })

  it('shows the audit trail with the previous and the new value', async () => {
    const absence = await seedAbsence({ type: 'vacation', date: TUESDAY })
    await createLocalRepository().updateAbsence(absence.id, { type: 'sick', date: TUESDAY })
    renderWithProviders(<AbsencesPage />)

    await waitFor(() => expect(screen.getByText('updated')).toBeInTheDocument())
    expect(
      screen.getByText(`Vacation on ${TUESDAY} → Sick leave on ${TUESDAY}`),
    ).toBeInTheDocument()
    expect(screen.getByText(`none → Vacation on ${TUESDAY}`)).toBeInTheDocument()
  })
})
