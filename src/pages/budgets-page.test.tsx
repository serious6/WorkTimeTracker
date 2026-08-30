import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, toDateKey } from '@/lib/date'
import {
  renderWithProviders,
  resetAppState,
  seedBudget,
  seedProject,
  seedTimeEntry,
  signIn,
} from '@/test/harness'
import { BudgetsPage } from './budgets-page'

const FUTURE_DATE = toDateKey(addDays(new Date(), 30))

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('BudgetsPage', () => {
  it('shows empty state when no budgets exist but a project does', async () => {
    await seedProject('Alpha')
    renderWithProviders(<BudgetsPage />)
    expect(await screen.findByText(/no budgets yet/i)).toBeInTheDocument()
  })

  it('shows create-project-first message when no projects exist', async () => {
    renderWithProviders(<BudgetsPage />)
    expect(await screen.findByText(/create a project first/i)).toBeInTheDocument()
  })

  it('lists seeded budgets', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    renderWithProviders(<BudgetsPage />)
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
  })

  it('shows budget consumption as progress towards the goal', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 600, dueDate: FUTURE_DATE })
    const start = new Date()
    start.setHours(9, 0, 0, 0)
    const end = new Date(start)
    end.setHours(10, 0, 0, 0)
    await seedTimeEntry({ projectId: project.id, startTime: start, endTime: end })
    renderWithProviders(<BudgetsPage />)
    const progress = await screen.findByRole('progressbar', {
      name: 'Budget consumption for Alpha',
    })
    expect(progress).toHaveAttribute('aria-valuenow', '10')
    expect(
      screen.getByText('1h 00m tracked (10%)'),
    ).toBeInTheDocument()
  })

  it('disabled "Create budget" button when no projects', async () => {
    renderWithProviders(<BudgetsPage />)
    expect(await screen.findByRole('button', { name: /create budget/i })).toBeDisabled()
  })

  it('opens create dialog when "Create budget" is clicked', async () => {
    await seedProject('Alpha')
    renderWithProviders(<BudgetsPage />)
    // Wait for projects to load (button becomes enabled)
    const createBtn = await screen.findByRole('button', { name: /create budget/i })
    await waitFor(() => expect(createBtn).not.toBeDisabled())
    fireEvent.click(createBtn)
    expect(await screen.findByRole('heading', { name: /create budget/i })).toBeInTheDocument()
  })

  it('opens edit dialog', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    renderWithProviders(<BudgetsPage />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getByRole('button', { name: /edit budget for alpha/i }))
    expect(await screen.findByRole('heading', { name: /edit budget/i })).toBeInTheDocument()
  })

  it('opens delete confirm dialog', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    renderWithProviders(<BudgetsPage />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getByRole('button', { name: /delete budget for alpha/i }))
    expect(await screen.findByText(/delete budget\?/i)).toBeInTheDocument()
  })

  it('deletes a budget after confirmation', async () => {
    const project = await seedProject('Alpha')
    await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    renderWithProviders(<BudgetsPage />)
    await screen.findByText('Alpha')
    fireEvent.click(screen.getByRole('button', { name: /delete budget for alpha/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^delete budget$/i }))
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
  })
})
