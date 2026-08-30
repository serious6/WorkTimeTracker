import type { DateRange } from '@/features/dashboard/metrics'
import { addDays, startOfDay } from '@/lib/date'
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

/** Scheduled minutes of a single day; days outside the schedule have no target. */
export function targetMinutesForDay(settings: Schedule, date: Date): number {
  return isWorkingDay(settings, date) ? dailyTargetMinutes(settings) : 0
}

/** Scheduled minutes of every calendar day that starts inside the range. */
export function scheduledMinutesInRange(settings: Schedule, range: DateRange): number {
  let total = 0
  for (let day = startOfDay(range.start); day < range.end; day = addDays(day, 1)) {
    total += targetMinutesForDay(settings, day)
  }
  return total
}
