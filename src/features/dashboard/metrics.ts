import { DELETED_PROJECT_NAME, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import type { Project } from '@/features/projects/project-schema'
import { addDays, MINUTE_MS, startOfDay, startOfWeek, type WeekStart } from '@/lib/date'

export type DateRange = { start: Date; end: Date }

export type ProjectTotal = {
  projectId: number | null
  name: string
  color: string
  minutes: number
  percentage: number
}

const DELETED_PROJECT_COLOR = '#64748b'

/** Elapsed milliseconds of an entry; running entries are measured against `now`. */
export function entryDurationMs(entry: TimeEntry, now = Date.now()): number {
  const end = entry.endTime ? Date.parse(entry.endTime) : now
  return Math.max(0, end - Date.parse(entry.startTime))
}

export function entryMinutes(entry: TimeEntry, now = Date.now()): number {
  return entryDurationMs(entry, now) / MINUTE_MS
}

export function entryDurationMsInRange(entry: TimeEntry, range: DateRange, now = Date.now()): number {
  const start = Date.parse(entry.startTime)
  const end = entry.endTime ? Date.parse(entry.endTime) : now
  return Math.max(0, Math.min(end, range.end.getTime()) - Math.max(start, range.start.getTime()))
}

export function entryMinutesInRange(entry: TimeEntry, range: DateRange, now = Date.now()): number {
  return entryDurationMsInRange(entry, range, now) / MINUTE_MS
}

export function isRunning(entry: TimeEntry): boolean {
  return entry.endTime === null
}

export function findRunningEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find(isRunning)
}

export function dayRange(date: Date): DateRange {
  const start = startOfDay(date)
  return { start, end: addDays(start, 1) }
}

export function weekRange(date: Date, weekStartsOn: WeekStart = 'monday'): DateRange {
  const start = startOfWeek(date, weekStartsOn)
  return { start, end: addDays(start, 7) }
}

export function monthRange(date: Date): DateRange {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  return { start, end: new Date(date.getFullYear(), date.getMonth() + 1, 1) }
}

export function entriesInRange(entries: TimeEntry[], range: DateRange, now = Date.now()): TimeEntry[] {
  const rangeStart = range.start.getTime()
  const rangeEnd = range.end.getTime()
  return entries
    .filter((entry) => {
      const start = Date.parse(entry.startTime)
      const end = entry.endTime ? Date.parse(entry.endTime) : now
      return start < rangeEnd && end > rangeStart
    })
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}

export function totalMinutes(entries: TimeEntry[], now = Date.now(), range?: DateRange): number {
  return entries.reduce(
    (total, entry) =>
      total + (range ? entryMinutesInRange(entry, range, now) : entryMinutes(entry, now)),
    0,
  )
}

/** Overtime is never negative. */
export function overtimeMinutes(trackedMinutes: number, targetMinutes: number): number {
  return Math.max(0, trackedMinutes - targetMinutes)
}

export function progressPercentage(trackedMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 0
  return Math.round((trackedMinutes / targetMinutes) * 100)
}

/** Totals per project, largest first, without projects that have no tracked time. */
export function projectTotals(
  entries: TimeEntry[],
  projects: Project[],
  now = Date.now(),
  range?: DateRange,
): ProjectTotal[] {
  const minutesByProject = new Map<number | null, number>()
  for (const entry of entries) {
    const current = minutesByProject.get(entry.projectId) ?? 0
    minutesByProject.set(
      entry.projectId,
      current + (range ? entryMinutesInRange(entry, range, now) : entryMinutes(entry, now)),
    )
  }

  const total = [...minutesByProject.values()].reduce((sum, minutes) => sum + minutes, 0)
  return [...minutesByProject]
    .filter(([, minutes]) => minutes > 0)
    .map(([projectId, minutes]) => {
      const project = projects.find((candidate) => candidate.id === projectId)
      return {
        projectId,
        name: project?.name ?? DELETED_PROJECT_NAME,
        color: project?.color ?? DELETED_PROJECT_COLOR,
        minutes,
        percentage: total > 0 ? Math.round((minutes / total) * 100) : 0,
      }
    })
    .sort((left, right) => right.minutes - left.minutes)
}

/** Projects with tracked time, most recently tracked first. */
export function recentProjects(
  entries: TimeEntry[],
  projects: Project[],
  limit = 5,
  now = Date.now(),
): ProjectTotal[] {
  const lastTracked = new Map<number, string>()
  const minutes = new Map<number, number>()
  for (const entry of entries) {
    if (entry.projectId === null) continue
    const previous = lastTracked.get(entry.projectId) ?? ''
    if (entry.startTime > previous) lastTracked.set(entry.projectId, entry.startTime)
    minutes.set(entry.projectId, (minutes.get(entry.projectId) ?? 0) + entryMinutes(entry, now))
  }

  return [...lastTracked]
    .sort(([, left], [, right]) => right.localeCompare(left))
    .slice(0, limit)
    .flatMap(([projectId]) => {
      const project = projects.find((candidate) => candidate.id === projectId)
      if (!project) return []
      return [
        {
          projectId,
          name: project.name,
          color: project.color,
          minutes: minutes.get(projectId) ?? 0,
          percentage: 0,
        },
      ]
    })
}
