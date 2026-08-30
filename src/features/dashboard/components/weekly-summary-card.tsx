import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, formatDuration, formatSignedDuration, type WeekStart } from '@/lib/date'
import { entriesInRange, monthRange, totalMinutes, weekRange } from '../metrics'

type SummaryRange = 'this-week' | 'last-week' | 'this-month'

const LABELS: Record<SummaryRange, string> = {
  'this-week': 'This week',
  'last-week': 'Last week',
  'this-month': 'Current month',
}

export function WeeklySummaryCard({
  entries,
  referenceDate,
  weekStartsOn,
  now,
  onOpenReports,
}: {
  entries: TimeEntry[]
  referenceDate: Date
  weekStartsOn: WeekStart
  now: number
  onOpenReports: () => void
}) {
  const [range, setRange] = useState<SummaryRange>('this-week')

  const current =
    range === 'this-month'
      ? monthRange(referenceDate)
      : weekRange(range === 'last-week' ? addDays(referenceDate, -7) : referenceDate, weekStartsOn)
  const previous =
    range === 'this-month'
      ? monthRange(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1))
      : weekRange(addDays(current.start, -7), weekStartsOn)

  const currentMinutes = totalMinutes(entriesInRange(entries, current, now), now, current)
  const previousMinutes = totalMinutes(entriesInRange(entries, previous, now), now, previous)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Summary</CardTitle>
        <Select
          aria-label="Summary range"
          className="w-36 text-xs"
          onChange={(event) => setRange(event.target.value as SummaryRange)}
          value={range}
        >
          {Object.entries(LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full rounded-md p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpenReports}
          variant="ghost"
        >
          <p className="text-2xl font-semibold tabular-nums">{formatDuration(currentMinutes)}</p>
          <p className="pt-1 text-xs text-muted-foreground">
            <span className={currentMinutes >= previousMinutes ? 'text-success' : 'text-warning'}>
              {formatSignedDuration(currentMinutes - previousMinutes)}
            </span>{' '}
            compared with the previous period
          </p>
        </Button>
      </CardContent>
    </Card>
  )
}
