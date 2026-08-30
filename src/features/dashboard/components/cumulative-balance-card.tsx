import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDay, formatDuration, formatSignedDuration } from '@/lib/date'
import type { CumulativeBalance } from '../balance'

/**
 * Running overtime balance across weeks and months. It is intentionally signed:
 * undertime is as important as overtime when deciding whether the day is done.
 */
export function CumulativeBalanceCard({
  balance,
  onOpenWeek,
}: {
  balance: CumulativeBalance
  onOpenWeek: () => void
}) {
  const tracking = balance.startDate !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Balance</CardTitle>
        <p className="text-xs text-muted-foreground">
          {tracking && balance.startDate
            ? `Since ${formatDay(balance.startDate)}`
            : 'No time tracked yet'}
        </p>
      </CardHeader>
      <CardContent>
        <button
          className="w-full rounded-md p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpenWeek}
          type="button"
        >
          <p
            className={`text-2xl font-semibold tabular-nums ${
              balance.balanceMinutes < 0 ? 'text-warning' : 'text-success'
            }`}
          >
            {formatSignedDuration(balance.balanceMinutes)}
          </p>
          <p className="pt-1 text-xs text-muted-foreground">
            Tracked {formatDuration(balance.trackedMinutes)} vs {formatDuration(balance.targetMinutes)} target
          </p>
          <p className="pt-1 text-xs text-muted-foreground">
            Carried into this day: {formatSignedDuration(balance.carriedOverMinutes)}
          </p>
        </button>
      </CardContent>
    </Card>
  )
}
