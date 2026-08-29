/**
 * The pie click handler and the tooltip formatter never run in jsdom, because
 * recharts measures its container before it draws. Recharts is replaced by a
 * minimal stand-in that hands both callbacks the data the real chart would.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { TimeByProjectCard } from './time-by-project-card'

type Slice = { projectId: number | null; name: string; minutes: number; percentage: number }

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: ({
    data,
    onClick,
  }: {
    data: Slice[]
    onClick: (item: { payload?: { projectId: number | null } }) => void
  }) => (
    <div>
      {data.map((slice) => (
        <button key={`${slice.projectId}`} onClick={() => onClick({ payload: slice })} type="button">
          {`Slice ${slice.name}`}
        </button>
      ))}
      <button onClick={() => onClick({})} type="button">
        Slice without payload
      </button>
    </div>
  ),
  Tooltip: ({ formatter }: { formatter: (value: number, name: string) => [string, string] }) => (
    <>
      <span>{formatter(90, 'Website Redesign')[0]}</span>
      <span>{formatter(30, 'Unknown project')[0]}</span>
    </>
  ),
  Cell: () => null,
}))

const referenceDate = new Date(2026, 7, 27)
const now = new Date(2026, 7, 27, 18).getTime()

function project(id: number, name: string): Project {
  return {
    id,
    name,
    description: null,
    color: '#22c55e',
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

function entry(id: number, projectId: number | null, startHour: number, endHour: number): TimeEntry {
  const start = new Date(2026, 7, 27, startHour)
  const end = new Date(2026, 7, 27, endHour)
  return {
    id,
    projectId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    note: null,
    createdAt: start.toISOString(),
    updatedAt: end.toISOString(),
  }
}

function renderCard(entries: TimeEntry[], projects: Project[]) {
  const onSelectProject = vi.fn()
  render(
    <TimeByProjectCard
      entries={entries}
      now={now}
      onSelectProject={onSelectProject}
      projects={projects}
      referenceDate={referenceDate}
      weekStartsOn="monday"
    />,
  )
  return onSelectProject
}

describe('time by project chart callbacks', () => {
  it('selects the project of the clicked slice', () => {
    const onSelectProject = renderCard([entry(1, 1, 9, 11)], [project(1, 'Website Redesign')])

    fireEvent.click(screen.getByRole('button', { name: 'Slice Website Redesign' }))

    expect(onSelectProject).toHaveBeenCalledWith(1)
  })

  it('clears the project filter for a slice without a payload', () => {
    const onSelectProject = renderCard([entry(1, 1, 9, 11)], [project(1, 'Website Redesign')])

    fireEvent.click(screen.getByRole('button', { name: 'Slice without payload' }))

    expect(onSelectProject).toHaveBeenCalledWith(null)
  })

  it('shows duration and share of the hovered slice', () => {
    renderCard([entry(1, 1, 9, 11)], [project(1, 'Website Redesign')])

    expect(screen.getByText('1h 30m (100%)')).toBeInTheDocument()
  })

  it('reports no share for a slice that is no longer part of the range', () => {
    renderCard([entry(1, 1, 9, 11)], [project(1, 'Website Redesign')])

    expect(screen.getByText('0h 30m (0%)')).toBeInTheDocument()
  })
})
