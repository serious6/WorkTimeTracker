import { useNavigationStore } from '@/app/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAbsenceIndex } from '@/features/absences/absence-queries'
import { ABSENCE_TYPE_LABELS } from '@/features/absences/absence-schema'
import { useDashboardStore, useSelectedDate } from '@/features/dashboard/dashboard-store'
import { dayRange, entriesInRange, monthRange, totalMinutes } from '@/features/dashboard/metrics'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { useTicker } from '@/features/timer/use-ticker'
import { addDays, formatDuration, startOfWeek, toDateKey } from '@/lib/date'
import { cn } from '@/lib/utils'

export function CalendarPage() {
  const selectedDate = useSelectedDate()
  const settings = useWorkSettings()
  const { data: entries = [] } = useTimeEntries()
  const absences = useAbsenceIndex()
  const now = useTicker(true)
  const setSelectedDate = useDashboardStore((state) => state.setSelectedDate)
  const navigate = useNavigationStore((state) => state.navigate)

  const month = monthRange(selectedDate)
  const gridStart = startOfWeek(month.start, settings.weekStartsOn)
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    addDays(gridStart, index).toLocaleDateString('en-US', { weekday: 'short' }),
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tracked time per day</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
            {weekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 pt-2">
            {days.map((day) => {
              const range = dayRange(day)
              const minutes = totalMinutes(entriesInRange(entries, range, now), now, range)
              const absence = absences.get(toDateKey(day)) ?? null
              const inMonth = day.getMonth() === selectedDate.getMonth()
              return (
                <Button
                  className={cn(
                    'rounded-md border border-border p-2 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                    !inMonth && 'opacity-40',
                    toDateKey(day) === toDateKey(selectedDate) && 'border-primary',
                  )}
                  key={toDateKey(day)}
                  onClick={() => {
                    setSelectedDate(toDateKey(day))
                    navigate('dashboard')
                  }}
                  variant="ghost"
                >
                  <span className="block font-medium">{day.getDate()}</span>
                  <span className="block tabular-nums text-muted-foreground">
                    {minutes > 0 ? formatDuration(minutes) : '–'}
                  </span>
                  {absence && (
                    <span className="block truncate text-muted-foreground">
                      {ABSENCE_TYPE_LABELS[absence]}
                    </span>
                  )}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
