import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  dayRange,
  entriesInRange,
  overtimeMinutes,
  projectTotals,
  totalMinutes,
  weekRange,
} from '@/features/dashboard/metrics'
import { useSelectedDate } from '@/features/dashboard/dashboard-store'
import { useProjects } from '@/features/projects/project-queries'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { addDays, formatDuration, formatWeekRange, startOfWeek } from '@/lib/date'

export function ReportsPage() {
  const selectedDate = useSelectedDate()
  const settings = useWorkSettings()
  const { data: entries = [] } = useTimeEntries()
  const { data: projects = [] } = useProjects()

  const weekStart = startOfWeek(selectedDate, settings.weekStartsOn)
  const weekEntries = entriesInRange(entries, weekRange(selectedDate, settings.weekStartsOn))
  const weekMinutes = totalMinutes(weekEntries)

  const data = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(weekStart, index)
    return {
      day: day.toLocaleDateString('en-US', { weekday: 'short' }),
      hours: totalMinutes(entriesInRange(entries, dayRange(day))) / 60,
    }
  })

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Week of {formatWeekRange(weekStart)}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Tracked hours per day</CardTitle>
            <p className="text-sm text-muted-foreground">
              Total: {formatDuration(weekMinutes)} · Overtime:{' '}
              {formatDuration(overtimeMinutes(weekMinutes, settings.weeklyTargetMinutes))}
            </p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" unit="h" />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects this week</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {projectTotals(weekEntries, projects).map((item) => (
                <li className="flex items-center gap-2" key={`${item.projectId}`}>
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(item.minutes)} ({item.percentage}%)
                  </span>
                </li>
              ))}
              {weekEntries.length === 0 && (
                <li className="text-muted-foreground">No time tracked this week.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
