import { NO_ABSENCES, type AbsenceIndex } from '@/features/absences/absence-index'
import { targetMinutesForDay } from '@/features/settings/work-schedule'
import type { WorkSettings } from '@/features/settings/work-settings-schema'
import { isBreak, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, startOfDay, toDateKey } from '@/lib/date'
import { entryMinutesInRange } from './metrics'

export type CumulativeBalance = {
  /** First day that counts towards the balance, `null` while nothing is tracked. */
  startDate: Date | null
  /** Last day that counts towards the balance, `null` while nothing is tracked. */
  endDate: Date | null
  trackedMinutes: number
  targetMinutes: number
  /** Tracked minus target across every counted day; negative means undertime. */
  balanceMinutes: number
  /** Balance of all days before `endDate`, the balance carried into that day. */
  carriedOverMinutes: number
}

const EMPTY_BALANCE: CumulativeBalance = {
  startDate: null,
  endDate: null,
  trackedMinutes: 0,
  targetMinutes: 0,
  balanceMinutes: 0,
  carriedOverMinutes: 0,
}

/** Tracked minutes per local calendar day; entries spanning midnight are split. */
export function trackedMinutesByDay(entries: TimeEntry[], now = Date.now()): Map<string, number> {
  const minutesByDay = new Map<string, number>()
  for (const entry of entries) {
    if (isBreak(entry)) continue
    const end = entry.endTime ? Date.parse(entry.endTime) : now
    for (let day = startOfDay(new Date(Date.parse(entry.startTime))); day.getTime() < end; day = addDays(day, 1)) {
      const minutes = entryMinutesInRange(entry, { start: day, end: addDays(day, 1) }, now)
      if (minutes > 0) minutesByDay.set(toDateKey(day), (minutesByDay.get(toDateKey(day)) ?? 0) + minutes)
    }
  }
  return minutesByDay
}

function firstTrackedDay(entries: TimeEntry[]): Date | null {
  let earliest: number | null = null
  for (const entry of entries) {
    if (isBreak(entry)) continue
    const start = Date.parse(entry.startTime)
    if (earliest === null || start < earliest) earliest = start
  }
  return earliest === null ? null : startOfDay(new Date(earliest))
}

/**
 * Running overtime balance since the first tracked day, carried across weeks and
 * months. Days after today never count, so a future selection cannot create
 * undertime that has not happened yet.
 */
export function cumulativeBalance({
  entries,
  settings,
  throughDate,
  absences = NO_ABSENCES,
  now = Date.now(),
}: {
  entries: TimeEntry[]
  settings: WorkSettings
  throughDate: Date
  absences?: AbsenceIndex
  now?: number
}): CumulativeBalance {
  const today = startOfDay(new Date(now))
  const selected = startOfDay(throughDate)
  const endDate = selected.getTime() > today.getTime() ? today : selected
  const startDate = firstTrackedDay(entries)
  if (!startDate || startDate > endDate) return EMPTY_BALANCE

  const minutesByDay = trackedMinutesByDay(entries, now)
  let trackedMinutes = 0
  let targetMinutes = 0
  let carriedOverMinutes = 0
  for (let day = startDate; day.getTime() <= endDate.getTime(); day = addDays(day, 1)) {
    if (day.getTime() === endDate.getTime()) carriedOverMinutes = trackedMinutes - targetMinutes
    trackedMinutes += minutesByDay.get(toDateKey(day)) ?? 0
    targetMinutes += targetMinutesForDay(settings, day, absences)
  }

  return {
    startDate,
    endDate,
    trackedMinutes,
    targetMinutes,
    balanceMinutes: trackedMinutes - targetMinutes,
    carriedOverMinutes,
  }
}
