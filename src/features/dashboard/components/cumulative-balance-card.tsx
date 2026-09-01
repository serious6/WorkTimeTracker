import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Balance</CardTitle>
        <p className="text-xs text-muted-foreground">
          {balance.startDate ? `Since ${formatDay(balance.startDate)}` : 'No time tracked yet'}
        </p>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full rounded-md p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpenWeek}
          variant="ghost"
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
          {balance.manualMinutes !== 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              Automatic {formatSignedDuration(balance.automaticMinutes)} · Manual{' '}
              {formatSignedDuration(balance.manualMinutes)}
            </p>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
