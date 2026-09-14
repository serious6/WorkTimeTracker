import type { RangeMetricsProject } from '@/features/week/week-metrics'
import { formatDecimalHours, formatDuration } from '@/lib/date'

function formatDurationPair(minutes: number): string {
  return `${formatDecimalHours(minutes)} · ${formatDuration(minutes)}`
}

export function ProjectSummary({
  label,
  projects,
  totalMinutes,
}: {
  label: string
  projects: RangeMetricsProject[]
  totalMinutes: number
}) {
  return (
    <div className="space-y-2 text-sm">
      {projects.length > 0 && (
        <ul aria-label={label} className="space-y-1">
          {projects.map((item) => (
            <li className="flex items-center gap-2" key={`${item.projectId}`}>
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatDurationPair(item.minutes)} <span>· {item.sharePercentage}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        aria-label={`${label} total`}
        className="flex items-center justify-between gap-2 border-t border-border pt-2 font-medium"
      >
        <span>Total</span>
        <span className="whitespace-nowrap tabular-nums">{formatDurationPair(totalMinutes)}</span>
      </div>
    </div>
  )
}
