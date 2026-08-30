import { NO_ABSENCES, type AbsenceIndex } from '@/features/absences/absence-index'
import type { AbsenceType } from '@/features/absences/absence-schema'
import type { DateRange } from '@/features/dashboard/metrics'
import { addDays, startOfDay, toDateKey } from '@/lib/date'
import { WEEKDAYS, type Weekday, type WorkSettings } from './work-settings-schema'

/** The fields of the settings that describe the schedule. */
type Schedule = Pick<WorkSettings, 'weeklyTargetMinutes' | 'workingDays'>

/** Weekday of a local date, starting the week on Monday. */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7]
}

export function isWorkingDay(settings: Pick<WorkSettings, 'workingDays'>, date: Date): boolean {
  return settings.workingDays.includes(weekdayOf(date))
}

/** The weekly target distributed evenly across the selected working days. */
export function dailyTargetMinutes(settings: Schedule): number {
  if (settings.workingDays.length === 0) return 0
  return settings.weeklyTargetMinutes / settings.workingDays.length
}

/**
 * Target of a day after an absence: a full-day absence neutralises it, a half
 * day halves it rounded to whole minutes. A day outside the schedule has no
 * target, so marking it as an absence changes nothing.
 *
 * `adjusted_daily_target` in `src-tauri/src/models.rs` implements the same
 * rule; both sides are driven by `contract/domain-rules.json`.
 */
export function adjustedDailyTarget(
  dailyTarget: number,
  workingDay: boolean,
  absence: AbsenceType | null,
): number {
  if (!workingDay) return 0
  if (absence === null) return dailyTarget
  return absence === 'halfDay' ? Math.round(dailyTarget / 2) : 0
}

/** Scheduled minutes of a single day; days outside the schedule have no target. */
export function targetMinutesForDay(
  settings: Schedule,
  date: Date,
  absences: AbsenceIndex = NO_ABSENCES,
): number {
  return adjustedDailyTarget(
    dailyTargetMinutes(settings),
    isWorkingDay(settings, date),
    absences.get(toDateKey(date)) ?? null,
  )
}

/** Scheduled minutes of every calendar day that starts inside the range. */
export function scheduledMinutesInRange(
  settings: Schedule,
  range: DateRange,
  absences: AbsenceIndex = NO_ABSENCES,
): number {
  let total = 0
  for (let day = startOfDay(range.start); day < range.end; day = addDays(day, 1)) {
    total += targetMinutesForDay(settings, day, absences)
  }
  return total
}
