import { CalendarCheck, Clock, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatDuration } from '@/lib/date'
import { overtimeMinutes, progressPercentage } from '../metrics'

type KpiCardProps = {
  label: string
  value: string
  caption: string
  icon: typeof Clock
  accent?: 'default' | 'success'
  progress?: number
}

function KpiCard({ label, value, caption, icon: Icon, accent = 'default', progress }: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`pt-1 text-3xl font-semibold tabular-nums ${
              accent === 'success' ? 'text-success' : ''
            }`}
          >
            {value}
          </p>
          <p className="pt-1 text-xs text-muted-foreground">{caption}</p>
        </div>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-lg ${
            accent === 'success' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'
          }`}
        >
          <Icon className="size-5" />
        </span>
      </div>
      {progress !== undefined && (
        <div className="flex items-center gap-3 pt-4">
          <Progress label={`${label} progress`} value={progress} />
          <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>
      )}
    </Card>
  )
}

/** Days outside the configured schedule have no target to compare against. */
function targetCaption(prefix: string, targetMinutes: number): string {
  return targetMinutes > 0 ? `${prefix} ${formatDuration(targetMinutes)}` : 'No target scheduled'
}

/** Remaining time until the day is done, so the target is not only a number. */
function remainingCaption(trackedMinutes: number, targetMinutes: number): string {
  if (targetMinutes <= 0) return 'No target scheduled'
  const remaining = targetMinutes - trackedMinutes
  const suffix = remaining > 0 ? `${formatDuration(remaining)} left` : 'target reached'
  return `${targetCaption('of', targetMinutes)} · ${suffix}`
}

export function KpiCards({
  trackedTodayMinutes,
  trackedWeekMinutes,
  dailyTargetMinutes,
  weeklyTargetMinutes,
}: {
  trackedTodayMinutes: number
  trackedWeekMinutes: number
  dailyTargetMinutes: number
  weeklyTargetMinutes: number
}) {
  const dailyOvertime = overtimeMinutes(trackedTodayMinutes, dailyTargetMinutes)
  const weeklyOvertime = overtimeMinutes(trackedWeekMinutes, weeklyTargetMinutes)

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        caption={remainingCaption(trackedTodayMinutes, dailyTargetMinutes)}
        icon={Clock}
        label="Tracked Today"
        progress={
          dailyTargetMinutes > 0
            ? progressPercentage(trackedTodayMinutes, dailyTargetMinutes)
            : undefined
        }
        value={formatDuration(trackedTodayMinutes)}
      />
      <KpiCard
        accent={dailyOvertime > 0 ? 'success' : 'default'}
        caption={targetCaption('vs', dailyTargetMinutes)}
        icon={TrendingUp}
        label="Overtime Today"
        value={formatDuration(dailyOvertime)}
      />
      <KpiCard
        accent={weeklyOvertime > 0 ? 'success' : 'default'}
        caption={targetCaption('vs', weeklyTargetMinutes)}
        icon={TrendingUp}
        label="Overtime This Week"
        value={formatDuration(weeklyOvertime)}
      />
      <KpiCard
        caption={targetCaption('of', weeklyTargetMinutes)}
        icon={CalendarCheck}
        label="Weekly Total"
        progress={
          weeklyTargetMinutes > 0
            ? progressPercentage(trackedWeekMinutes, weeklyTargetMinutes)
            : undefined
        }
        value={formatDuration(trackedWeekMinutes)}
      />
    </section>
  )
}
