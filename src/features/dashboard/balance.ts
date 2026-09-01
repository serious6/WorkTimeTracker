import { NO_ABSENCES, type AbsenceIndex } from '@/features/absences/absence-index'
import { explicitOvertime } from '@/features/overtime/overtime-balance'
import type { OvertimeEntry } from '@/features/overtime/overtime-schema'
import { targetMinutesForDay } from '@/features/settings/work-schedule'
import type { WorkSettings } from '@/features/settings/work-settings-schema'
import { isBreak, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, fromDateKey, startOfDay, toDateKey } from '@/lib/date'
import { entryMinutesInRange } from './metrics'

export type CumulativeBalance = {
  /** First day that counts towards the balance, `null` while nothing is tracked. */
  startDate: Date | null
  /** Last day that counts towards the balance, `null` while nothing is tracked. */
  endDate: Date | null
  trackedMinutes: number
  targetMinutes: number
  /** Automatic plus explicit overtime; negative means undertime. */
  balanceMinutes: number
  /** Balance of all days before `endDate`, the balance carried into that day. */
  carriedOverMinutes: number
  /** Part derived from the time entries, the target and the absences. */
  automaticMinutes: number
  /** Part contributed by the explicit overtime records. */
  manualMinutes: number
}

const EMPTY_BALANCE: CumulativeBalance = {
  startDate: null,
  endDate: null,
  trackedMinutes: 0,
  targetMinutes: 0,
  balanceMinutes: 0,
  carriedOverMinutes: 0,
  automaticMinutes: 0,
  manualMinutes: 0,
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
 *
 * The derived part is recomputed from the time entries on every call and is
 * never persisted; the explicit records are added on top. An `opening` or
 * `balance` record replaces the derived overtime of the days before its
 * effective date, so a balance carried over from outside the application is not
 * counted twice.
 */
export function cumulativeBalance({
  entries,
  settings,
  throughDate,
  absences = NO_ABSENCES,
  overtime = [],
  now = Date.now(),
}: {
  entries: TimeEntry[]
  settings: WorkSettings
  throughDate: Date
  absences?: AbsenceIndex
  overtime?: OvertimeEntry[]
  now?: number
}): CumulativeBalance {
  const today = startOfDay(new Date(now))
  const selected = startOfDay(throughDate)
  const endDate = selected.getTime() > today.getTime() ? today : selected
  const explicit = explicitOvertime(overtime, toDateKey(endDate))
  const tracked = firstTrackedDay(entries)
  const anchor = explicit.startKey ? startOfDay(fromDateKey(explicit.startKey)) : null
  const startDate = tracked && anchor && anchor > tracked ? anchor : tracked
  if (!startDate || startDate > endDate) {
    return { ...EMPTY_BALANCE, balanceMinutes: explicit.minutes, manualMinutes: explicit.minutes }
  }

  const minutesByDay = trackedMinutesByDay(entries, now)
  let trackedMinutes = 0
  let targetMinutes = 0
  let carriedOverMinutes = 0
  for (let day = startDate; day.getTime() <= endDate.getTime(); day = addDays(day, 1)) {
    if (day.getTime() === endDate.getTime()) {
      carriedOverMinutes =
        trackedMinutes -
        targetMinutes +
        explicitOvertime(overtime, toDateKey(addDays(endDate, -1))).minutes
    }
    trackedMinutes += minutesByDay.get(toDateKey(day)) ?? 0
    targetMinutes += targetMinutesForDay(settings, day, absences)
  }
  const automaticMinutes = trackedMinutes - targetMinutes

  return {
    startDate,
    endDate,
    trackedMinutes,
    targetMinutes,
    balanceMinutes: automaticMinutes + explicit.minutes,
    carriedOverMinutes,
    automaticMinutes,
    manualMinutes: explicit.minutes,
  }
}
