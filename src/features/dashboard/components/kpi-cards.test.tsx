import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiCards } from './kpi-cards'

function renderKpi(
  trackedTodayMinutes: number,
  trackedWeekMinutes: number,
  dailyTargetMinutes: number,
  weeklyTargetMinutes: number,
) {
  render(
    <KpiCards
      dailyTargetMinutes={dailyTargetMinutes}
      trackedTodayMinutes={trackedTodayMinutes}
      trackedWeekMinutes={trackedWeekMinutes}
      weeklyTargetMinutes={weeklyTargetMinutes}
    />,
  )
}

describe('KpiCards', () => {
  it('displays tracked time and overtime for today', () => {
    renderKpi(540, 1080, 480, 2400)
    expect(screen.getByText('9h 00m')).toBeInTheDocument() // tracked today
    expect(screen.getByText('1h 00m')).toBeInTheDocument() // overtime today
  })

  it('shows No target scheduled caption when no daily target', () => {
    renderKpi(60, 120, 0, 0)
    const captions = screen.getAllByText('No target scheduled')
    expect(captions.length).toBeGreaterThanOrEqual(2)
  })

  it('renders progress bar for daily target', () => {
    renderKpi(240, 240, 480, 2400)
    expect(screen.getByLabelText('Tracked Today progress')).toBeInTheDocument()
  })

  it('does not render progress bar when no daily target', () => {
    renderKpi(120, 480, 0, 2400)
    expect(screen.queryByLabelText('Tracked Today progress')).not.toBeInTheDocument()
  })

  it('shows weekly overtime when weekly tracked exceeds target', () => {
    renderKpi(0, 2520, 480, 2400)
    // 2520 - 2400 = 120 mins = 2h
    expect(screen.getByText('2h 00m')).toBeInTheDocument()
  })

  it('shows zero overtime when under target', () => {
    renderKpi(0, 0, 480, 2400)
    // multiple cards showing 0h 00m
    const zeros = screen.getAllByText('0h 00m')
    expect(zeros.length).toBeGreaterThanOrEqual(1)
  })

  it('shows remaining time left when below the daily target', () => {
    renderKpi(240, 240, 480, 2400)
    expect(screen.getByText('of 8h 00m · 4h 00m left')).toBeInTheDocument()
  })

  it('shows target reached when at or above the daily target', () => {
    renderKpi(540, 540, 480, 2400)
    expect(screen.getByText('of 8h 00m · target reached')).toBeInTheDocument()
  })
})
