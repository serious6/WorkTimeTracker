import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OvertimeOverviewCard } from './overtime-overview-card'

const selectedDate = new Date(2026, 7, 27)
const weekStart = new Date(2026, 7, 24) // Monday

describe('OvertimeOverviewCard', () => {
  it('shows overtime when tracked exceeds target', () => {
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={480}
        onOpenDay={vi.fn()}
        onOpenWeek={vi.fn()}
        selectedDate={selectedDate}
        trackedTodayMinutes={540}
        trackedWeekMinutes={2400}
        weekStart={weekStart}
        weeklyTargetMinutes={2400}
      />,
    )
    expect(screen.getByText('1h 00m')).toBeInTheDocument() // 60 min overtime
  })

  it('shows "No overtime" when under or at target', () => {
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={480}
        onOpenDay={vi.fn()}
        onOpenWeek={vi.fn()}
        selectedDate={selectedDate}
        trackedTodayMinutes={300}
        trackedWeekMinutes={0}
        weekStart={weekStart}
        weeklyTargetMinutes={2400}
      />,
    )
    const noOvertimes = screen.getAllByText('No overtime')
    expect(noOvertimes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows "No target scheduled" when target is 0', () => {
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={0}
        onOpenDay={vi.fn()}
        onOpenWeek={vi.fn()}
        selectedDate={selectedDate}
        trackedTodayMinutes={120}
        trackedWeekMinutes={300}
        weekStart={weekStart}
        weeklyTargetMinutes={0}
      />,
    )
    const noTargets = screen.getAllByText('No target scheduled')
    expect(noTargets.length).toBeGreaterThanOrEqual(2)
  })

  it('calls onOpenDay when One Day section is clicked', () => {
    const onOpenDay = vi.fn()
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={480}
        onOpenDay={onOpenDay}
        onOpenWeek={vi.fn()}
        selectedDate={selectedDate}
        trackedTodayMinutes={600}
        trackedWeekMinutes={0}
        weekStart={weekStart}
        weeklyTargetMinutes={2400}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /One Day/i }))
    expect(onOpenDay).toHaveBeenCalledOnce()
  })

  it('calls onOpenWeek when One Week section is clicked', () => {
    const onOpenWeek = vi.fn()
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={480}
        onOpenDay={vi.fn()}
        onOpenWeek={onOpenWeek}
        selectedDate={selectedDate}
        trackedTodayMinutes={0}
        trackedWeekMinutes={2520}
        weekStart={weekStart}
        weeklyTargetMinutes={2400}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /One Week/i }))
    expect(onOpenWeek).toHaveBeenCalledOnce()
  })

  it('renders progress bars when targets are set', () => {
    render(
      <OvertimeOverviewCard
        dailyTargetMinutes={480}
        onOpenDay={vi.fn()}
        onOpenWeek={vi.fn()}
        selectedDate={selectedDate}
        trackedTodayMinutes={240}
        trackedWeekMinutes={1200}
        weekStart={weekStart}
        weeklyTargetMinutes={2400}
      />,
    )
    expect(screen.getByLabelText('One Day progress')).toBeInTheDocument()
    expect(screen.getByLabelText('One Week progress')).toBeInTheDocument()
  })
})
