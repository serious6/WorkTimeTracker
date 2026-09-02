import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CumulativeBalance } from '../balance'
import { CumulativeBalanceCard } from './cumulative-balance-card'

const balance: CumulativeBalance = {
  startDate: new Date(2026, 7, 3),
  endDate: new Date(2026, 7, 24),
  trackedMinutes: 2_640,
  targetMinutes: 2_400,
  balanceMinutes: 240,
  carriedOverMinutes: 120,
  automaticMinutes: 240,
  explicitMinutes: 0,
}

describe('CumulativeBalanceCard', () => {
  it('shows the signed balance and the period it covers', () => {
    render(<CumulativeBalanceCard balance={balance} onOpenWeek={() => {}} />)

    expect(screen.getByText('+4h 00m')).toBeInTheDocument()
    expect(screen.getByText('Since August 3, 2026')).toBeInTheDocument()
    expect(screen.getByText('Carried into this day: +2h 00m')).toBeInTheDocument()
  })

  it('shows undertime with a negative sign', () => {
    render(
      <CumulativeBalanceCard
        balance={{ ...balance, balanceMinutes: -90 }}
        onOpenWeek={() => {}}
      />,
    )

    expect(screen.getByText('-1h 30m')).toBeInTheDocument()
  })

  it('splits the balance into the automatic and the manual part', () => {
    render(
      <CumulativeBalanceCard
        balance={{ ...balance, balanceMinutes: 300, explicitMinutes: 60 }}
        onOpenWeek={() => {}}
      />,
    )

    expect(screen.getByText('Automatic +4h 00m · Explicit +1h 00m')).toBeInTheDocument()
  })

  it('explains that nothing is tracked yet', () => {
    render(
      <CumulativeBalanceCard
        balance={{
          startDate: null,
          endDate: null,
          trackedMinutes: 0,
          targetMinutes: 0,
          balanceMinutes: 0,
          carriedOverMinutes: 0,
          automaticMinutes: 0,
          explicitMinutes: 0,
        }}
        onOpenWeek={() => {}}
      />,
    )

    expect(screen.getByText('No time tracked yet')).toBeInTheDocument()
  })
})
