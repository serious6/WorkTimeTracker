import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, toDateKey } from '@/lib/date'
import {
  renderWithProviders,
  resetAppState,
  seedBudget,
  seedProject,
  seedTimeEntry,
  signIn,
  atTime,
} from '@/test/harness'
import { BudgetReportCard } from './budget-report-card'
import type { Project } from '@/features/projects/project-schema'
import type { ProjectBudget } from '@/features/budgets/budget-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'

const FUTURE_DATE = toDateKey(addDays(new Date(), 30))

function render(
  projects: Project[],
  budgets: ProjectBudget[],
  entries: TimeEntry[],
  selectedProjectId: number | null = null,
  onSelectProject = vi.fn(),
) {
  return renderWithProviders(
    <BudgetReportCard
      projects={projects}
      budgets={budgets}
      entries={entries}
      selectedProjectId={selectedProjectId}
      onSelectProject={onSelectProject}
      now={Date.now()}
    />,
  )
}

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('BudgetReportCard', () => {
  it('shows prompt to select a project when none selected', () => {
    render([], [], [])
    expect(screen.getByText('Select a project to see its budget.')).toBeInTheDocument()
  })

  it('shows no budget message when project has no budget', async () => {
    const project = await seedProject('Alpha')
    render([project], [], [], project.id)
    expect(screen.getByText(/no budget is defined/i)).toBeInTheDocument()
  })

  it('calls onSelectProject when project is selected', async () => {
    const project = await seedProject('Alpha')
    const onSelectProject = vi.fn()
    render([project], [], [], null, onSelectProject)
    fireEvent.change(
      screen.getByRole('combobox', { name: /budget project/i }),
      { target: { value: String(project.id) } },
    )
    expect(onSelectProject).toHaveBeenCalledWith(project.id)
  })

  it('renders budget report when project and budget are selected', async () => {
    const project = await seedProject('Alpha')
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 4800, dueDate: FUTURE_DATE })
    const ref = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 10),
    })
    render([project], [budget], [entry], project.id)
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Tracked')).toBeInTheDocument()
  })

  it('shows "Budget exceeded" message when over budget', async () => {
    const project = await seedProject('Alpha')
    // Only 1 minute budget
    const budget = await seedBudget({ projectId: project.id, budgetMinutes: 1, dueDate: FUTURE_DATE })
    const ref = new Date()
    const entry = await seedTimeEntry({
      projectId: project.id,
      startTime: atTime(ref, 9),
      endTime: atTime(ref, 11),
    })
    render([project], [budget], [entry], project.id)
    expect(screen.getByText(/budget exceeded/i)).toBeInTheDocument()
  })
})
