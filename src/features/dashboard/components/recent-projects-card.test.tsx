import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { RecentProjectsCard } from './recent-projects-card'

function project(id: number, name: string): Project {
  return { id, name, description: null, color: '#3b82f6', active: true, createdAt: '', updatedAt: '' }
}

function entry(id: number, projectId: number, startIso: string, endIso: string): TimeEntry {
  return {
    id,
    projectId,
    startTime: startIso,
    endTime: endIso,
    entryType: 'work',
    note: null,
    createdAt: startIso,
    updatedAt: startIso,
  }
}

const now = new Date(2026, 7, 27, 12).getTime()

describe('RecentProjectsCard', () => {
  it('shows empty state when no projects were tracked', () => {
    render(
      <RecentProjectsCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        onViewAll={vi.fn()}
        projects={[]}
      />,
    )
    expect(screen.getByText('No projects tracked yet')).toBeInTheDocument()
  })

  it('lists recent projects sorted by most recently tracked', () => {
    const projects = [project(1, 'Alpha'), project(2, 'Beta')]
    const entries = [
      entry(1, 1, '2026-08-26T09:00:00.000Z', '2026-08-26T10:00:00.000Z'),
      entry(2, 2, '2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z'),
    ]
    render(
      <RecentProjectsCard
        entries={entries}
        now={now}
        onSelectProject={vi.fn()}
        onViewAll={vi.fn()}
        projects={projects}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Beta')
    expect(items[1]).toHaveTextContent('Alpha')
  })

  it('calls onSelectProject when a project is clicked', () => {
    const onSelectProject = vi.fn()
    const projects = [project(1, 'Alpha')]
    const entries = [entry(1, 1, '2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z')]
    render(
      <RecentProjectsCard
        entries={entries}
        now={now}
        onSelectProject={onSelectProject}
        onViewAll={vi.fn()}
        projects={projects}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Alpha/i }))
    expect(onSelectProject).toHaveBeenCalledWith(1)
  })

  it('calls onViewAll when the View all button is clicked', () => {
    const onViewAll = vi.fn()
    render(
      <RecentProjectsCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        onViewAll={onViewAll}
        projects={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /View all/i }))
    expect(onViewAll).toHaveBeenCalledOnce()
  })

  it('shows duration for each project', () => {
    const projects = [project(1, 'Alpha')]
    const entries = [entry(1, 1, '2026-08-27T09:00:00.000Z', '2026-08-27T10:00:00.000Z')]
    render(
      <RecentProjectsCard
        entries={entries}
        now={now}
        onSelectProject={vi.fn()}
        onViewAll={vi.fn()}
        projects={projects}
      />,
    )
    expect(screen.getByText('1h 00m')).toBeInTheDocument()
  })
})
