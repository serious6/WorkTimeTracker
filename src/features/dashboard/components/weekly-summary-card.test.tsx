import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { WeeklySummaryCard } from './weekly-summary-card'

function entry(id: number, startIso: string, endIso: string): TimeEntry {
  return {
    id,
    projectId: 1,
    startTime: startIso,
    endTime: endIso,
    note: null,
    createdAt: startIso,
    updatedAt: startIso,
  }
}

const referenceDate = new Date(2026, 7, 27) // Wednesday, Aug 27 2026
const now = referenceDate.getTime()

describe('WeeklySummaryCard', () => {
  it('shows this week hours by default', () => {
    const entries = [
      entry(1, '2026-08-24T09:00:00.000Z', '2026-08-24T11:00:00.000Z'), // Mon 2h
    ]
    render(
      <WeeklySummaryCard
        entries={entries}
        now={now}
        onOpenReports={vi.fn()}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    // 120 minutes = 2h 00m
    expect(screen.getByText('2h 00m')).toBeInTheDocument()
  })

  it('shows zero hours when no entries for the week', () => {
    render(
      <WeeklySummaryCard
        entries={[]}
        now={now}
        onOpenReports={vi.fn()}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    expect(screen.getByText('0h 00m')).toBeInTheDocument()
  })

  it('switches to last week when selected', () => {
    const entries = [
      entry(1, '2026-08-17T09:00:00.000Z', '2026-08-17T10:00:00.000Z'), // last week Mon
    ]
    render(
      <WeeklySummaryCard
        entries={entries}
        now={now}
        onOpenReports={vi.fn()}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    fireEvent.change(screen.getByLabelText('Summary range'), { target: { value: 'last-week' } })
    expect(screen.getByText('1h 00m')).toBeInTheDocument()
  })

  it('switches to current month when selected', () => {
    const entries = [
      entry(1, '2026-08-01T09:00:00.000Z', '2026-08-01T10:00:00.000Z'),
    ]
    render(
      <WeeklySummaryCard
        entries={entries}
        now={now}
        onOpenReports={vi.fn()}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    fireEvent.change(screen.getByLabelText('Summary range'), { target: { value: 'this-month' } })
    expect(screen.getByText('1h 00m')).toBeInTheDocument()
  })

  it('calls onOpenReports when the summary button is clicked', () => {
    const onOpenReports = vi.fn()
    render(
      <WeeklySummaryCard
        entries={[]}
        now={now}
        onOpenReports={onOpenReports}
        referenceDate={referenceDate}
        weekStartsOn="monday"
      />,
    )
    // The summary is a button wrapping the hours display
    fireEvent.click(screen.getByRole('button', { name: /0h 00m/i }))
    expect(onOpenReports).toHaveBeenCalledOnce()
  })
})
