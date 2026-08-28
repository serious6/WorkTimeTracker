import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/features/projects/project-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { DayEntriesCard } from './day-entries-card'

function project(id: number, name: string): Project {
  return { id, name, description: null, color: '#22c55e', active: true, createdAt: '', updatedAt: '' }
}

function entry(id: number, projectId: number, startOffset: number, endOffset: number): TimeEntry {
  const now = new Date(2026, 7, 27, 9, 0, 0, 0)
  const start = new Date(now.getTime() + startOffset * 60_000)
  const end = new Date(now.getTime() + endOffset * 60_000)
  return {
    id,
    projectId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    note: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  }
}

const now = new Date(2026, 7, 27, 10, 0, 0, 0).getTime()
const projects = [project(1, 'Website')]

describe('DayEntriesCard', () => {
  it('shows empty state when no entries exist', () => {
    render(
      <DayEntriesCard
        entries={[]}
        now={now}
        onAddEntry={vi.fn()}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={vi.fn()}
        projects={projects}
        title="Today's Entries"
      />,
    )
    expect(screen.getByText('No time tracked today')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument()
  })

  it('calls onStartTimer when Start timer is clicked from empty state', () => {
    const onStartTimer = vi.fn()
    render(
      <DayEntriesCard
        entries={[]}
        now={now}
        onAddEntry={vi.fn()}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={onStartTimer}
        projects={projects}
        title="Today's Entries"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    expect(onStartTimer).toHaveBeenCalledOnce()
  })

  it('calls onAddEntry when Add entry is clicked from empty state', () => {
    const onAddEntry = vi.fn()
    render(
      <DayEntriesCard
        entries={[]}
        now={now}
        onAddEntry={onAddEntry}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={vi.fn()}
        projects={projects}
        title="Today's Entries"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(onAddEntry).toHaveBeenCalledOnce()
  })

  it('shows total duration when entries exist', () => {
    const entries = [entry(1, 1, 0, 60)] // 1 hour
    render(
      <DayEntriesCard
        entries={entries}
        now={now}
        onAddEntry={vi.fn()}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={vi.fn()}
        projects={projects}
        title="Today's Entries"
      />,
    )
    expect(screen.getByText('Total: 1h 00m')).toBeInTheDocument()
  })

  it('always shows the Add time entry button', () => {
    render(
      <DayEntriesCard
        entries={[entry(1, 1, 0, 30)]}
        now={now}
        onAddEntry={vi.fn()}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={vi.fn()}
        projects={projects}
        title="Today's Entries"
      />,
    )
    expect(screen.getByRole('button', { name: /Add time entry/i })).toBeInTheDocument()
  })

  it('uses the provided title', () => {
    render(
      <DayEntriesCard
        entries={[]}
        now={now}
        onAddEntry={vi.fn()}
        onPause={vi.fn()}
        onPlay={vi.fn()}
        onStartTimer={vi.fn()}
        projects={projects}
        title="Wednesday"
      />,
    )
    expect(screen.getByText('Wednesday')).toBeInTheDocument()
  })
})
