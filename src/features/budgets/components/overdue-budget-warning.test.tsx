import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import type { ProjectBudget } from '../budget-schema'
import { OverdueBudgetWarning } from './overdue-budget-warning'

const NOW = new Date(2026, 7, 26, 12).getTime()

const budget: ProjectBudget = {
  id: 1,
  projectId: 1,
  budgetMinutes: 60,
  dueDate: '2026-08-25',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const entries: TimeEntry[] = [
  {
    id: 1,
    projectId: 1,
    startTime: new Date(2026, 7, 24, 9).toISOString(),
    endTime: new Date(2026, 7, 24, 11).toISOString(),
    entryType: 'work',
    note: null,
    createdAt: '2026-08-24T09:00:00.000Z',
    updatedAt: '2026-08-24T09:00:00.000Z',
  },
]

describe('OverdueBudgetWarning', () => {
  it('renders nothing without an overdue budget', () => {
    const { container } = render(
      <OverdueBudgetWarning budgets={[]} entries={entries} now={NOW} projectId={1} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('announces the overdue budget as a status message', () => {
    render(<OverdueBudgetWarning budgets={[budget]} entries={entries} now={NOW} projectId={1} />)

    const warning = screen.getByRole('status')
    expect(warning).toHaveTextContent('Budget overdue')
    expect(warning).toHaveTextContent('exceeded by 1h 00m')
  })
})
