import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { errorToast, toast } from '@/components/ui/toast-store'
import { dayRange, entriesInRange } from '@/features/dashboard/metrics'
import { useDashboardStore, useSelectedDate } from '@/features/dashboard/dashboard-store'
import { useProjects } from '@/features/projects/project-queries'
import { dailyTargetMinutes } from '@/features/settings/work-schedule'
import { useWorkSettings } from '@/features/settings/work-settings-queries'
import { TimeEntryDialog } from '@/features/time-entries/components/time-entry-dialog'
import { TimeEntryList } from '@/features/time-entries/components/time-entry-list'
import { useTimeEntries } from '@/features/time-entries/time-entry-queries'
import { parseDurationMinutes, QUICK_ADD_MINUTES } from '@/features/time-management/quick-add'
import { useQuickAdd } from '@/features/time-management/use-quick-add'
import { useTicker } from '@/features/timer/use-ticker'
import { useTimer } from '@/features/timer/use-timer'
import {
  dayTargetDeltaLabel,
  formatWeekSubtitle,
  isoWeekNumber,
  monthOverviewMetrics,
  weekMetrics,
} from '@/features/week/week-metrics'
import { addDays, formatDay, formatDuration, formatSignedDuration, startOfWeek, toDateKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

function quickAddLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : minutes === 60 ? '1 hour' : formatDuration(minutes)
}

export function WeekPage() {
  const selectedDate = useSelectedDate()
  const setSelectedDate = useDashboardStore((state) => state.setSelectedDate)
  const settings = useWorkSettings()
  const { data: entries = [] } = useTimeEntries()
  const { data: projects = [] } = useProjects()
  const now = useTicker(true)
  const timer = useTimer(now)
  const quickAdd = useQuickAdd()
  const [entryDate, setEntryDate] = useState<Date>()
  const [projectValue, setProjectValue] = useState('')
  const [customDuration, setCustomDuration] = useState('')
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const week = useMemo(
    () => weekMetrics({ entries, projects, settings, selectedDate, now }),
    [entries, projects, settings, selectedDate, now],
  )
  const month = useMemo(
    () => monthOverviewMetrics({ entries, projects, settings, selectedDate, now }),
    [entries, projects, settings, selectedDate, now],
  )
  const [selectedDayKey, setSelectedDayKey] = useState(() => toDateKey(selectedDate))

  const weekStart = week.range.start
  const selectedWeekStartKey = toDateKey(startOfWeek(selectedDate, settings.weekStartsOn))
  const activeDayKey = week.days.some((day) => day.dateKey === selectedDayKey)
    ? selectedDayKey
    : week.days[0]?.dateKey
  const quickAddProjectId = projectValue ? Number(projectValue) : undefined

  async function addQuick(minutes: number) {
    if (!quickAddProjectId || !activeDayKey) return
    const project = projects.find((candidate) => candidate.id === quickAddProjectId)
    await quickAdd({ projectId: quickAddProjectId, dateKey: activeDayKey, minutes })
    toast('Time added', `${quickAddLabel(minutes)} added to ${project?.name ?? 'project'}`)
  }

  function jumpToWeek(days: number) {
    setSelectedDate(toDateKey(addDays(selectedDate, days)))
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Week</h1>
          <p className="text-sm text-muted-foreground">
            {formatWeekSubtitle(weekStart)} · KW {isoWeekNumber(addDays(weekStart, (1 - weekStart.getDay() + 7) % 7))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button aria-label="Previous week" onClick={() => jumpToWeek(-7)} size="icon" variant="outline">
            <ChevronLeft className="size-4" />
          </Button>
          <Button aria-label="Next week" onClick={() => jumpToWeek(7)} size="icon" variant="outline">
            <ChevronRight className="size-4" />
          </Button>
          <Button
            onClick={() => setSelectedDate(toDateKey(new Date()))}
            variant="outline"
          >
            This week
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Tracked this week</p>
          <p className="pt-1 text-3xl font-semibold tabular-nums">{formatDuration(week.trackedMinutes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Target this week</p>
          <p className="pt-1 text-3xl font-semibold tabular-nums">{formatDuration(week.targetMinutes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Progress</p>
          <p className="pt-1 text-3xl font-semibold tabular-nums">{week.progressPercentage}%</p>
          <div className="pt-3">
            <Progress label="Week progress" value={week.progressPercentage} />
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p className="pt-1 text-3xl font-semibold tabular-nums">{formatDuration(week.remainingMinutes)}</p>
          <p className="pt-1 text-xs text-muted-foreground">{week.remainingWorkingDays} working days left</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Overtime / balance (to date)</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                week.balanceToDateMinutes >= 0 ? 'text-success' : 'text-warning',
              )}
            >
              {formatSignedDuration(week.balanceToDateMinutes)}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              Tracked {formatDuration(week.trackedMinutes)} vs pro-rated target{' '}
              {formatDuration(week.proratedTargetMinutes)}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Forecast (end of week)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Projected total: {formatDuration(week.forecastMinutes)}</p>
            <p className={week.forecastBalanceMinutes >= 0 ? 'text-success' : 'text-warning'}>
              Projected balance: {formatSignedDuration(week.forecastBalanceMinutes)}
            </p>
            <p className="text-muted-foreground">
              Required average: {formatDuration(week.requiredAveragePerRemainingDayMinutes)} / remaining day
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Secondary stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Average day length: {formatDuration(week.averageDayLengthMinutes)}</p>
            <p>
              Days booked: {week.bookedDays} / {week.totalWorkingDays}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Weekly breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {week.days.map((day) => {
            const width = day.targetMinutes > 0 ? (day.trackedMinutes / day.targetMinutes) * 100 : 0
            return (
              <button
                className={cn(
                  'w-full rounded-md border border-border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  activeDayKey === day.dateKey && 'border-primary',
                )}
                key={day.dateKey}
                onClick={() => {
                  setSelectedDayKey(day.dateKey)
                  dayRefs.current[day.dateKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                type="button"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {day.date.toLocaleDateString('en-US', { weekday: 'short' })}, {day.date.getDate()}
                  </span>
                  <span className="tabular-nums">
                    {formatDuration(day.trackedMinutes)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      day.targetMinutes > 0 && day.trackedMinutes > day.targetMinutes ? 'bg-success' : 'bg-primary',
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
                  />
                </div>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects this week</CardTitle>
        </CardHeader>
        <CardContent>
          {week.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked projects this week.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {week.projects.map((item) => (
                <li className="flex items-center gap-2" key={`${item.projectId}`}>
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(item.minutes)} · {item.sharePercentage}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage week bookings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="pb-2 text-sm font-medium">Quick add</p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="block flex-1 space-y-1 text-sm font-medium">
                Project
                <Select
                  aria-label="Quick add project"
                  onChange={(event) => setProjectValue(event.target.value)}
                  value={projectValue}
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm font-medium lg:w-56">
                Selected day
                <Input
                  aria-label="Selected quick-add day"
                  onChange={(event) => setSelectedDayKey(event.target.value)}
                  type="date"
                  value={activeDayKey ?? ''}
                />
              </label>
            </div>
            <div className="pt-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_ADD_MINUTES.map((minutes) => (
                  <Button
                    disabled={!quickAddProjectId || !activeDayKey}
                    key={minutes}
                    onClick={() =>
                      addQuick(minutes).catch((failure) =>
                        errorToast('Time not added', errorMessage(failure, 'The time could not be added.')),
                      )
                    }
                    variant="subtle"
                  >
                    <Plus className="size-4" />
                    {quickAddLabel(minutes)}
                  </Button>
                ))}
                <Button
                  disabled={!quickAddProjectId || !activeDayKey}
                  onClick={() =>
                    addQuick(dailyTargetMinutes(settings)).catch((failure) =>
                      errorToast('Time not added', errorMessage(failure, 'The time could not be added.')),
                    )
                  }
                  variant="subtle"
                >
                  <Plus className="size-4" />
                  1 day
                </Button>
              </div>
              <div className="flex items-end gap-2 pt-3">
                <label className="block flex-1 space-y-1 text-sm font-medium">
                  Custom duration
                  <Input
                    aria-label="Quick add custom duration"
                    onChange={(event) => setCustomDuration(event.target.value)}
                    placeholder="e.g. 1h 30m"
                    value={customDuration}
                  />
                </label>
                <Button
                  disabled={!quickAddProjectId || !activeDayKey}
                  onClick={() => {
                    const minutes = parseDurationMinutes(customDuration)
                    if (!minutes) {
                      errorToast('Invalid duration', 'Enter a valid duration such as 90m or 1h 30m.')
                      return
                    }
                    addQuick(minutes)
                      .then(() => setCustomDuration(''))
                      .catch((failure) =>
                        errorToast('Time not added', errorMessage(failure, 'The time could not be added.')),
                      )
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {week.days.map((day) => {
            const dayEntries = entriesInRange(entries, dayRange(day.date), now)
            return (
              <div
                className="rounded-lg border border-border p-3"
                key={day.dateKey}
                ref={(element) => {
                  dayRefs.current[day.dateKey] = element
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <div>
                    <h3 className="font-medium">{formatDay(day.date)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(day.trackedMinutes)} ·{' '}
                      <span className={day.trackedMinutes >= day.targetMinutes ? 'text-success' : 'text-warning'}>
                        {dayTargetDeltaLabel(day.trackedMinutes, day.targetMinutes)}
                      </span>
                    </p>
                  </div>
                  <Button onClick={() => setEntryDate(day.date)} size="sm" variant="outline">
                    <Plus className="size-4" />
                    Add entry
                  </Button>
                </div>
                <TimeEntryList
                  emptyState={<p className="text-sm text-muted-foreground">No bookings on this day.</p>}
                  entries={dayEntries}
                  now={now}
                  onPause={() => void timer.pause()}
                  onPlay={(projectId) => void timer.switchTo(projectId)}
                  projects={projects}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {month.month.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} – month to date
          </CardTitle>
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            Read-only · editing is only available in the week section above.
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Tracked month-to-date</p>
              <p className="pt-1 text-lg font-semibold tabular-nums">{formatDuration(month.trackedMinutes)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Target month-to-date</p>
              <p className="pt-1 text-lg font-semibold tabular-nums">{formatDuration(month.targetMinutes)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Month progress</p>
              <p className="pt-1 text-lg font-semibold tabular-nums">{month.progressPercentage}%</p>
              <div className="pt-2">
                <Progress label="Month progress" value={month.progressPercentage} />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Month balance (to date)</p>
              <p
                className={cn(
                  'pt-1 text-lg font-semibold tabular-nums',
                  month.balanceToDateMinutes >= 0 ? 'text-success' : 'text-warning',
                )}
              >
                {formatSignedDuration(month.balanceToDateMinutes)}
              </p>
            </Card>
          </div>

          <div className="space-y-2 text-sm">
            <p>
              Forecast for month end: {formatDuration(month.forecastMinutes)} (
              {formatSignedDuration(month.forecastBalanceMinutes)})
            </p>
            <p>
              Days booked: {month.bookedDays} · Average day length: {formatDuration(month.averageDayLengthMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">
              Month is derived from the start date of the selected week.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Weeks in month</p>
            <ul className="space-y-2">
              {month.weekStrip.map((item) => {
                const key = toDateKey(item.weekStart)
                return (
                  <li key={key}>
                    <button
                      aria-current={key === selectedWeekStartKey ? 'page' : undefined}
                      className={cn(
                        'w-full rounded-md border border-border p-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                        key === selectedWeekStartKey && 'border-primary',
                      )}
                      onClick={() => setSelectedDate(key)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{item.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatDuration(item.trackedMinutes)} / {formatDuration(item.targetMinutes)} (
                          {formatSignedDuration(item.balanceMinutes)})
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Projects month-to-date</p>
            {month.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracked projects in this month.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {month.projects.map((item) => (
                  <li className="flex items-center gap-2" key={`${item.projectId}`}>
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatDuration(item.minutes)} · {item.sharePercentage}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <TimeEntryDialog date={entryDate} onClose={() => setEntryDate(undefined)} open={Boolean(entryDate)} />
    </div>
  )
}
