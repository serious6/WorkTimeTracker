import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { addDays, formatDay, formatWeekRange, formatDuration } from '@/lib/date'
import { overtimeMinutes, progressPercentage } from '../metrics'

function OvertimeSection({
  label,
  overtime,
  caption,
  period,
  progress,
  onOpen,
}: {
  label: string
  overtime: number
  caption: string
  period: string
  progress?: number
  onOpen: () => void
}) {
  return (
    // `h-auto` and the column layout override the Button defaults (fixed 40px
    // height, centred row); without them the multi-line content overlaps.
    <Button
      className="flex h-auto w-full flex-col items-stretch justify-start gap-2 rounded-md p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      variant="ghost"
    >
      <span className="block text-sm font-medium text-primary">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2 sm:items-center">
        <div className="min-w-0">
          <span
            className={`block break-words text-2xl font-semibold tabular-nums ${
              overtime > 0 ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            {overtime > 0 ? formatDuration(overtime) : 'No overtime'}
          </span>
          <span className="block break-words text-xs text-muted-foreground">{period}</span>
        </div>
        <div className="min-w-0">
          {progress !== undefined && (
            <Progress
              indicatorClassName={overtime > 0 ? 'bg-success' : 'bg-muted-foreground'}
              label={`${label} progress`}
              value={progress}
            />
          )}
          <span className="block break-words pt-1 text-xs text-muted-foreground">{caption}</span>
        </div>
      </div>
    </Button>
  )
}

function targetCaption(targetMinutes: number): string {
  return targetMinutes > 0 ? `vs ${formatDuration(targetMinutes)} target` : 'No target scheduled'
}

export function OvertimeOverviewCard({
  selectedDate,
  weekStart,
  trackedTodayMinutes,
  trackedWeekMinutes,
  dailyTargetMinutes,
  weeklyTargetMinutes,
  onOpenDay,
  onOpenWeek,
}: {
  selectedDate: Date
  weekStart: Date
  trackedTodayMinutes: number
  trackedWeekMinutes: number
  dailyTargetMinutes: number
  weeklyTargetMinutes: number
  onOpenDay: () => void
  onOpenWeek: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overtime Overview</CardTitle>
        <p className="text-xs text-muted-foreground">{formatWeekRange(weekStart)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <OvertimeSection
          caption={targetCaption(dailyTargetMinutes)}
          label="One Day"
          onOpen={onOpenDay}
          overtime={overtimeMinutes(trackedTodayMinutes, dailyTargetMinutes)}
          period={formatDay(selectedDate)}
          progress={
            dailyTargetMinutes > 0
              ? progressPercentage(trackedTodayMinutes, dailyTargetMinutes)
              : undefined
          }
        />
        <OvertimeSection
          caption={targetCaption(weeklyTargetMinutes)}
          label="One Week"
          onOpen={onOpenWeek}
          overtime={overtimeMinutes(trackedWeekMinutes, weeklyTargetMinutes)}
          period={`${formatDay(weekStart)} – ${formatDay(addDays(weekStart, 6))}`}
          progress={
            weeklyTargetMinutes > 0
              ? progressPercentage(trackedWeekMinutes, weeklyTargetMinutes)
              : undefined
          }
        />
      </CardContent>
    </Card>
  )
}
