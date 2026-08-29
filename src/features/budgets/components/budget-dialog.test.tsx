import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, toDateKey } from '@/lib/date'
import {
  renderWithProviders,
  resetAppState,
  seedBudget,
  seedProject,
  signIn,
} from '@/test/harness'
import { BudgetDialog } from './budget-dialog'

const FUTURE_DATE = toDateKey(addDays(new Date(), 30))

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('BudgetDialog – create', () => {
  it('renders the create title', () => {
    renderWithProviders(<BudgetDialog open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: /create budget/i })).toBeInTheDocument()
  })

  it('shows "Project is required" when no project selected', async () => {
    renderWithProviders(<BudgetDialog open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create budget/i }))
    expect(await screen.findByText('Project is required')).toBeInTheDocument()
  })

  it('shows budget hours error when no hours entered', async () => {
    const project = await seedProject('Alpha')
    renderWithProviders(<BudgetDialog open onClose={() => {}} />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: String(project.id) } })
    fireEvent.click(screen.getByRole('button', { name: /create budget/i }))
    expect(await screen.findByText(/budget must be greater than zero/i)).toBeInTheDocument()
  })

  it('creates a budget and closes', async () => {
    const project = await seedProject('Alpha')
    let closed = false
    renderWithProviders(<BudgetDialog open onClose={() => { closed = true }} />)
    await waitFor(() => screen.getByRole('option', { name: 'Alpha' }))
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: String(project.id) } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /budget/i }), { target: { value: '80', valueAsNumber: 80 } })
    const dateInput = document.querySelector('input[name="dueDate"]')!
    fireEvent.change(dateInput, { target: { value: FUTURE_DATE } })
    fireEvent.click(screen.getByRole('button', { name: /create budget/i }))
    await waitFor(() => expect(closed).toBe(true))
  })

  it('calls onClose when Cancel is clicked', () => {
    let closed = false
    renderWithProviders(<BudgetDialog open onClose={() => { closed = true }} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(closed).toBe(true)
  })
})

describe('BudgetDialog – edit', () => {
  it('shows edit title and pre-fills the form', async () => {
    const project = await seedProject('Alpha')
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    renderWithProviders(<BudgetDialog open budget={budget} onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit budget/i })).toBeInTheDocument()
      expect(screen.getByDisplayValue('80')).toBeInTheDocument()
    })
  })

  it('updates a budget and closes', async () => {
    const project = await seedProject('Alpha')
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    let closed = false
    renderWithProviders(<BudgetDialog open budget={budget} onClose={() => { closed = true }} />)
    // Wait for both the hours value and the project option to be available
    await waitFor(() => {
      expect(screen.getByDisplayValue('80')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    })
    // Re-assert all controlled values so FormData picks them up correctly
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: String(project.id) } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /budget/i }), { target: { value: '80', valueAsNumber: 80 } })
    fireEvent.change(document.querySelector('input[name="dueDate"]')!, { target: { value: FUTURE_DATE } })
    fireEvent.click(screen.getByRole('button', { name: /save budget/i }))
    await waitFor(() => expect(closed).toBe(true))
  })
})
