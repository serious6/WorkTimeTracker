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
    <Button
      className="w-full rounded-md p-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      variant="ghost"
    >
      <p className="text-sm font-medium text-primary">{label}</p>
      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p
            className={`text-2xl font-semibold tabular-nums ${
              overtime > 0 ? 'text-success' : 'text-muted-foreground'
            }`}
          >
            {overtime > 0 ? formatDuration(overtime) : 'No overtime'}
          </p>
          <p className="text-xs text-muted-foreground">{period}</p>
        </div>
        <div className="w-full sm:w-1/2">
          {progress !== undefined && (
            <Progress
              indicatorClassName={overtime > 0 ? 'bg-success' : 'bg-muted-foreground'}
              label={`${label} progress`}
              value={progress}
            />
          )}
          <p className="pt-1 text-xs text-muted-foreground">{caption}</p>
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
