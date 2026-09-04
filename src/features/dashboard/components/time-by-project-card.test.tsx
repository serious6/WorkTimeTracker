import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { TimeByProjectCard } from './time-by-project-card'

function project(id: number, name: string, color = '#22c55e'): Project {
  return { id, name, description: null, color, active: true, archived: false, createdAt: '', updatedAt: '' }
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

function localIso(day: number, hour: number): string {
  return new Date(2026, 7, day, hour).toISOString()
}

const referenceDate = new Date(2026, 7, 27)
const now = referenceDate.getTime()

describe('TimeByProjectCard', () => {
  it('shows empty state when no entries', () => {
    render(
      <TimeByProjectCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        projects={[]}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    expect(screen.getByText('No time tracked yet')).toBeInTheDocument()
  })

  it('shows project totals for today by default', () => {
    const projects = [project(1, 'Website')]
    const entries = [
      entry(1, 1, localIso(27, 0), localIso(27, 2)),
    ]
    render(
      <TimeByProjectCard
        entries={entries}
        now={now}
        onSelectProject={vi.fn()}
        projects={projects}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    expect(screen.getByText('Website')).toBeInTheDocument()
  })

  it('switches range when a different option is selected', () => {
    const projects = [project(1, 'Website')]
    const entries = [
      entry(1, 1, localIso(24, 9), localIso(24, 10)), // this week Mon
    ]
    render(
      <TimeByProjectCard
        entries={entries}
        now={now}
        onSelectProject={vi.fn()}
        projects={projects}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    // start with today - no entries for today
    expect(screen.getByText('No time tracked yet')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Chart range'), { target: { value: 'this-week' } })
    expect(screen.getByText('Website')).toBeInTheDocument()
  })

  it('shows custom date inputs when custom range is selected', () => {
    render(
      <TimeByProjectCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        projects={[]}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    fireEvent.change(screen.getByLabelText('Chart range'), { target: { value: 'custom' } })
    expect(screen.getByLabelText('Range start')).toBeInTheDocument()
    expect(screen.getByLabelText('Range end')).toBeInTheDocument()
  })

  it('calls onSelectProject when a project row is clicked', () => {
    const onSelectProject = vi.fn()
    const projects = [project(1, 'Website')]
    const entries = [
      entry(1, 1, localIso(27, 0), localIso(27, 1)),
    ]
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
    fireEvent.click(screen.getByRole('button', { name: /Website/i }))
    expect(onSelectProject).toHaveBeenCalledWith(1)
  })

  it('updates custom from date when typed', () => {
    render(
      <TimeByProjectCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        projects={[]}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    fireEvent.change(screen.getByLabelText('Chart range'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Range start'), { target: { value: '2026-08-01' } })
    expect((screen.getByLabelText('Range start') as HTMLInputElement).value).toBe('2026-08-01')
  })

  it('updates custom to date when Range end is changed', () => {
    render(
      <TimeByProjectCard
        entries={[]}
        now={now}
        onSelectProject={vi.fn()}
        projects={[]}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    fireEvent.change(screen.getByLabelText('Chart range'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Range end'), { target: { value: '2026-08-15' } })
    expect((screen.getByLabelText('Range end') as HTMLInputElement).value).toBe('2026-08-15')
  })
})
