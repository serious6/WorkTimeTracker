import { type DateRange, entriesInRange, entryMinutesInRange, monthRange, weekRange } from '@/features/dashboard/metrics'
import type { Project } from '@/features/projects/project-schema'
import { dailyTargetMinutes, isWorkingDay, scheduledMinutesInRange } from '@/features/settings/work-schedule'
import type { WorkSettings } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, formatDuration, formatShortDay, startOfDay, startOfWeek, toDateKey } from '@/lib/date'

/**
 * `zero` marks a day that has bookings adding up to no time at all, which is
 * different from `untracked`, a working day without any booking.
 */
export type DayStatus = 'tracked' | 'zero' | 'untracked' | 'non-working'

export type RangeMetricsDay = {
  date: Date
  dateKey: string
  trackedMinutes: number
  targetMinutes: number
  workingDay: boolean
  hasEntries: boolean
  status: DayStatus
}

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  tracked: 'Tracked',
  zero: 'Booked without time',
  untracked: 'Not tracked',
  'non-working': 'Non-working day',
}

function dayStatus(trackedMinutes: number, hasEntries: boolean, workingDay: boolean): DayStatus {
  if (trackedMinutes > 0) return 'tracked'
  if (hasEntries) return 'zero'
  return workingDay ? 'untracked' : 'non-working'
}

export type RangeMetricsProject = {
  projectId: number | null
  name: string
  color: string
  minutes: number
  sharePercentage: number
}

export type RangeMetrics = {
  range: DateRange
  trackedMinutes: number
  targetMinutes: number
  progressPercentage: number
  remainingMinutes: number
  remainingWorkingDays: number
  totalWorkingDays: number
  elapsedWorkingDays: number
  bookedDays: number
  averageDayLengthMinutes: number
  proratedTargetMinutes: number
  balanceToDateMinutes: number
  forecastMinutes: number
  forecastBalanceMinutes: number
  requiredAveragePerRemainingDayMinutes: number
  days: RangeMetricsDay[]
  projects: RangeMetricsProject[]
}

export type MonthWeekStrip = {
  weekStart: Date
  weekEnd: Date
  label: string
  trackedMinutes: number
  targetMinutes: number
  balanceMinutes: number
}

export type MonthOverviewMetrics = RangeMetrics & {
  month: DateRange
  monthToDate: DateRange
  weekStrip: MonthWeekStrip[]
}

const DELETED_PROJECT_COLOR = '#64748b'

function round(value: number): number {
  return Math.round(value)
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0
  return round((part / total) * 100)
}

function timeline(range: DateRange): Date[] {
  const days: Date[] = []
  for (let day = startOfDay(range.start); day < range.end; day = addDays(day, 1)) days.push(day)
  return days
}

function elapsedRange(referenceNow: Date, range: DateRange): DateRange {
  const nowStart = startOfDay(referenceNow)
  if (nowStart <= range.start) return { start: range.start, end: range.start }
  if (nowStart >= range.end) return range
  return { start: range.start, end: addDays(nowStart, 1) }
}

function completedRange(referenceNow: Date, range: DateRange): DateRange {
  const nowStart = startOfDay(referenceNow)
  if (nowStart <= range.start) return { start: range.start, end: range.start }
  if (nowStart >= range.end) return range
  return { start: range.start, end: nowStart }
}

/** Whether an entry belongs to a day, including bookings without any duration. */
function touchesDay(entry: TimeEntry, day: DateRange, now: number): boolean {
  const start = Date.parse(entry.startTime)
  const end = entry.endTime ? Date.parse(entry.endTime) : now
  if (start >= day.end.getTime()) return false
  return end > day.start.getTime() || (end === start && start >= day.start.getTime())
}

function projectName(project: Project | undefined): string {
  return project?.name ?? 'Deleted project'
}

function projectColor(project: Project | undefined): string {
  return project?.color ?? DELETED_PROJECT_COLOR
}

export function rangeMetrics({
  entries,
  projects,
  settings,
  range,
  now = Date.now(),
}: {
  entries: TimeEntry[]
  projects: Project[]
  settings: WorkSettings
  range: DateRange
  now?: number
}): RangeMetrics {
  const nowDate = new Date(now)
  const inRange = entriesInRange(entries, range, now)
  const dayList = timeline(range)
  const projectById = new Map(projects.map((project) => [project.id, project] as const))
  const elapsed = elapsedRange(nowDate, range)
  const completed = completedRange(nowDate, range)
  const elapsedDays = timeline(elapsed)
  const completedDays = timeline(completed)
  const dailyTarget = dailyTargetMinutes(settings)
  const targetMinutes = scheduledMinutesInRange(settings, range)
  const totalWorkingDays = dayList.filter((day) => isWorkingDay(settings, day)).length
  const elapsedWorkingDays = elapsedDays.filter((day) => isWorkingDay(settings, day)).length
  const remainingWorkingDays = Math.max(totalWorkingDays - elapsedWorkingDays, 0)

  const days = dayList.map((day) => {
    const dayInterval = { start: day, end: addDays(day, 1) }
    const trackedMinutes = inRange.reduce(
      (total, entry) => total + entryMinutesInRange(entry, dayInterval, now),
      0,
    )
    const targetMinutesForDay = isWorkingDay(settings, day) ? dailyTarget : 0
    const hasEntries = inRange.some((entry) => touchesDay(entry, dayInterval, now))
    const workingDay = targetMinutesForDay > 0
    return {
      date: day,
      dateKey: toDateKey(day),
      trackedMinutes,
      targetMinutes: targetMinutesForDay,
      workingDay,
      hasEntries,
      status: dayStatus(trackedMinutes, hasEntries, workingDay),
    }
  })

  const trackedMinutes = days.reduce((total, day) => total + day.trackedMinutes, 0)
  const bookedDays = days.filter((day) => day.trackedMinutes > 0).length
  const averageDayLengthMinutes = bookedDays > 0 ? trackedMinutes / bookedDays : 0
  const proratedTargetMinutes = elapsedWorkingDays * dailyTarget
  const balanceToDateMinutes = trackedMinutes - proratedTargetMinutes

  const daysByKey = new Map(days.map((day) => [day.dateKey, day] as const))
  const trackedCompletedWorkingDays = completedDays
    .filter((day) => isWorkingDay(settings, day))
    .reduce((total, day) => total + (daysByKey.get(toDateKey(day))?.trackedMinutes ?? 0), 0)
  const completedWorkingDays = completedDays.filter((day) => isWorkingDay(settings, day)).length
  const averageCompletedWorkingDayMinutes =
    completedWorkingDays > 0 ? trackedCompletedWorkingDays / completedWorkingDays : dailyTarget
  const forecastMinutes = trackedMinutes + remainingWorkingDays * averageCompletedWorkingDayMinutes
  const remainingMinutes = Math.max(targetMinutes - trackedMinutes, 0)
  const requiredAveragePerRemainingDayMinutes =
    remainingWorkingDays > 0 ? remainingMinutes / remainingWorkingDays : 0

  const perProject = new Map<number | null, { minutes: number }>()
  for (const entry of inRange) {
    const minutes = entryMinutesInRange(entry, range, now)
    const current = perProject.get(entry.projectId) ?? { minutes: 0 }
    perProject.set(entry.projectId, { minutes: current.minutes + minutes })
  }

  const projectsBreakdown = [...perProject.entries()]
    .filter(([, row]) => row.minutes > 0)
    .map(([projectId, row]) => {
      const project = projectId ? projectById.get(projectId) : undefined
      return {
        projectId,
        name: projectName(project),
        color: projectColor(project),
        minutes: row.minutes,
        sharePercentage: percentage(row.minutes, trackedMinutes),
      }
    })
    .sort((left, right) => right.minutes - left.minutes)

  return {
    range,
    trackedMinutes,
    targetMinutes,
    progressPercentage: percentage(trackedMinutes, targetMinutes),
    remainingMinutes,
    remainingWorkingDays,
    totalWorkingDays,
    elapsedWorkingDays,
    bookedDays,
    averageDayLengthMinutes,
    proratedTargetMinutes,
    balanceToDateMinutes,
    forecastMinutes,
    forecastBalanceMinutes: forecastMinutes - targetMinutes,
    requiredAveragePerRemainingDayMinutes,
    days,
    projects: projectsBreakdown,
  }
}

export function weekMetrics({
  entries,
  projects,
  settings,
  selectedDate,
  now = Date.now(),
}: {
  entries: TimeEntry[]
  projects: Project[]
  settings: WorkSettings
  selectedDate: Date
  now?: number
}): RangeMetrics {
  return rangeMetrics({ entries, projects, settings, range: weekRange(selectedDate, settings.weekStartsOn), now })
}

export function monthWeekStrip({
  entries,
  projects,
  settings,
  month,
  now = Date.now(),
}: {
  entries: TimeEntry[]
  projects: Project[]
  settings: WorkSettings
  month: DateRange
  now?: number
}): MonthWeekStrip[] {
  const rows: MonthWeekStrip[] = []
  const firstWeekStart = startOfWeek(month.start, settings.weekStartsOn)
  for (let weekStart = firstWeekStart; weekStart < month.end; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 7)
    const range = {
      start: weekStart < month.start ? month.start : weekStart,
      end: weekEnd > month.end ? month.end : weekEnd,
    }
    const metrics = rangeMetrics({ entries, projects, settings, range, now })
    rows.push({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      label: `${formatShortDay(weekStart)} – ${formatShortDay(addDays(weekStart, 6))}`,
      trackedMinutes: metrics.trackedMinutes,
      targetMinutes: metrics.targetMinutes,
      balanceMinutes: metrics.trackedMinutes - metrics.targetMinutes,
    })
  }
  return rows
}

export function monthOverviewMetrics({
  entries,
  projects,
  settings,
  selectedDate,
  now = Date.now(),
}: {
  entries: TimeEntry[]
  projects: Project[]
  settings: WorkSettings
  selectedDate: Date
  now?: number
}): MonthOverviewMetrics {
  const selectedWeekStart = startOfWeek(selectedDate, settings.weekStartsOn)
  const month = monthRange(selectedWeekStart)
  const end = new Date(Math.min(addDays(startOfDay(new Date(now)), 1).getTime(), month.end.getTime()))
  const monthToDate = { start: month.start, end: end < month.start ? month.start : end }
  const metrics = rangeMetrics({ entries, projects, settings, range: monthToDate, now })
  return {
    ...metrics,
    month,
    monthToDate,
    weekStrip: monthWeekStrip({ entries, projects, settings, month, now }),
  }
}

export function formatWeekSubtitle(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  return `${weekStart.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function isoWeekNumber(date: Date): number {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1_000))
}

export function dayTargetDeltaLabel(trackedMinutes: number, targetMinutes: number): string {
  if (targetMinutes <= 0) return 'No target'
  const delta = trackedMinutes - targetMinutes
  return `${delta >= 0 ? '+' : '-'}${formatDuration(Math.abs(delta))} vs target`
}
