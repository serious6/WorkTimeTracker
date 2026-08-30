import { entryMinutes } from '@/features/dashboard/metrics'
import { isBreak, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDuration, toDateKey } from '@/lib/date'

/** Working time after which ArbZG § 4 requires a break of 30 minutes. */
export const BREAK_THRESHOLD_MINUTES = 360
/** Working time after which ArbZG § 4 requires a break of 45 minutes. */
export const LONG_BREAK_THRESHOLD_MINUTES = 540
export const REQUIRED_BREAK_MINUTES = 30
export const REQUIRED_LONG_BREAK_MINUTES = 45
/** Daily maximum of ArbZG § 3. */
export const MAX_DAILY_WORK_MINUTES = 600
/** Uninterrupted rest between two working days, ArbZG § 5. */
export const MIN_REST_MINUTES = 660
/** Working time records are kept for at least two years, ArbZG § 16 (2). */
export const RETENTION_YEARS = 2

export type WorkingDay = {
  dateKey: string
  date: Date
  start: Date | null
  end: Date | null
  workMinutes: number
  breakMinutes: number
}

export type ComplianceRule = 'break' | 'dailyMaximum' | 'restPeriod'

export type ComplianceWarning = {
  dateKey: string
  rule: ComplianceRule
  message: string
}

/**
 * Groups entries into working days by the calendar day of their start. Break
 * entries are counted separately, they are never part of the working time.
 */
export function workingDays(entries: TimeEntry[], now = Date.now()): WorkingDay[] {
  const days = new Map<string, WorkingDay>()
  for (const entry of entries) {
    const start = new Date(entry.startTime)
    const dateKey = toDateKey(start)
    const day = days.get(dateKey) ?? {
      dateKey,
      date: start,
      start: null,
      end: null,
      workMinutes: 0,
      breakMinutes: 0,
    }
    const end = entry.endTime ? new Date(entry.endTime) : new Date(now)
    const minutes = entryMinutes(entry, now)
    days.set(dateKey, {
      ...day,
      start: !day.start || start < day.start ? start : day.start,
      end: !day.end || end > day.end ? end : day.end,
      workMinutes: day.workMinutes + (isBreak(entry) ? 0 : minutes),
      breakMinutes: day.breakMinutes + (isBreak(entry) ? minutes : 0),
    })
  }
  return [...days.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey))
}

/** Minutes of break that the worked time of a day requires. */
export function requiredBreakMinutes(workMinutes: number): number {
  if (workMinutes > LONG_BREAK_THRESHOLD_MINUTES) return REQUIRED_LONG_BREAK_MINUTES
  if (workMinutes > BREAK_THRESHOLD_MINUTES) return REQUIRED_BREAK_MINUTES
  return 0
}

function dayWarnings(day: WorkingDay, previous?: WorkingDay): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = []
  const required = requiredBreakMinutes(day.workMinutes)
  if (required > 0 && day.breakMinutes < required) {
    warnings.push({
      dateKey: day.dateKey,
      rule: 'break',
      message: `${formatDuration(day.workMinutes)} worked with only ${formatDuration(
        day.breakMinutes,
      )} of break, at least ${formatDuration(required)} are required.`,
    })
  }
  if (day.workMinutes > MAX_DAILY_WORK_MINUTES) {
    warnings.push({
      dateKey: day.dateKey,
      rule: 'dailyMaximum',
      message: `${formatDuration(day.workMinutes)} worked, the daily maximum is ${formatDuration(
        MAX_DAILY_WORK_MINUTES,
      )}.`,
    })
  }
  if (previous?.end && day.start) {
    const restMinutes = (day.start.getTime() - previous.end.getTime()) / 60_000
    if (restMinutes < MIN_REST_MINUTES) {
      warnings.push({
        dateKey: day.dateKey,
        rule: 'restPeriod',
        message: `Only ${formatDuration(restMinutes)} of rest after ${previous.dateKey}, at least ${formatDuration(
          MIN_REST_MINUTES,
        )} are required.`,
      })
    }
  }
  return warnings
}

/**
 * Warnings are informative only. Recording actual working time is never
 * blocked, even when a limit is exceeded.
 */
export function complianceWarnings(days: WorkingDay[]): ComplianceWarning[] {
  return days.flatMap((day, index) => dayWarnings(day, days[index - 1]))
}

export function complianceWarningsForEntries(
  entries: TimeEntry[],
  now = Date.now(),
): ComplianceWarning[] {
  return complianceWarnings(workingDays(entries, now))
}
