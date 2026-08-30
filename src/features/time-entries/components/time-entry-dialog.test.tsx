import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { toDateKey } from '@/lib/date'
import {
  renderWithProviders,
  resetAppState,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import { TimeEntryDialog } from './time-entry-dialog'

const TODAY = toDateKey(new Date())

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('TimeEntryDialog – create', () => {
  it('renders the add title', () => {
    renderWithProviders(<TimeEntryDialog open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: /add time entry/i })).toBeInTheDocument()
  })

  it('shows validation error when no project selected', async () => {
    renderWithProviders(<TimeEntryDialog open onClose={() => {}} />)
    // Submit button click triggers form validation
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }))
    expect(await screen.findByText(/project is required/i)).toBeInTheDocument()
  })

  it('creates an entry and closes', async () => {
    const project = await seedProject('Alpha')
    let closed = false
    renderWithProviders(<TimeEntryDialog open onClose={() => { closed = true }} />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: String(project.id) } })
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }))
    await waitFor(() => expect(closed).toBe(true))
  })

  it('accepts and normalises lenient manual times', async () => {
    const project = await seedProject('Alpha')
    let closed = false
    renderWithProviders(<TimeEntryDialog open onClose={() => { closed = true }} />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: String(project.id) } })
    fireEvent.change(screen.getByRole('textbox', { name: /start time/i }), { target: { value: '9.5h' } })
    fireEvent.change(screen.getByRole('textbox', { name: /end time/i }), { target: { value: '1100' } })
    fireEvent.click(screen.getByRole('button', { name: /add entry/i }))
    await waitFor(() => expect(closed).toBe(true))
  })

  it('calls onClose when Cancel is clicked', () => {
    let closed = false
    renderWithProviders(<TimeEntryDialog open onClose={() => { closed = true }} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(closed).toBe(true)
  })
})

describe('TimeEntryDialog – duplicate', () => {
  it('shows duplicate title', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 10),
    })
    renderWithProviders(<TimeEntryDialog open initialEntry={entry} onClose={() => {}} />)
    expect(await screen.findByRole('heading', { name: /duplicate time entry/i })).toBeInTheDocument()
  })
})

describe('TimeEntryDialog – edit', () => {
  it('shows edit title and pre-fills form', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 10),
      note: 'meeting',
    })
    renderWithProviders(<TimeEntryDialog open entry={entry} onClose={() => {}} />)
    expect(await screen.findByRole('heading', { name: /edit time entry/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue(TODAY)).toBeInTheDocument()
  })

  it('updates entry and closes', async () => {
    const project = await seedProject('Alpha')
    const ref = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 10),
    })
    let closed = false
    renderWithProviders(<TimeEntryDialog open entry={entry} onClose={() => { closed = true }} />)
    await waitFor(() => screen.getByRole('heading', { name: /edit time entry/i }))
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    await waitFor(() => expect(closed).toBe(true))
  })
})
