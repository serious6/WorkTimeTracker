import {
  GERMAN_COMPLIANCE_LIMITS,
  type ComplianceLimits,
} from '@/features/settings/work-settings-schema'
import { entryMinutes } from '@/features/dashboard/metrics'
import { isBreak, type TimeEntry } from '@/features/time-entries/time-entry-schema'
import { formatDuration, toDateKey } from '@/lib/date'

/** Working time records are kept for at least two years, ArbZG § 16 (2). */
export const RETENTION_YEARS = 2

export type WorkingDay = {
  dateKey: string
  date: Date
  start: Date | null
  end: Date | null
  workMinutes: number
  /** Every recorded break minute of the day. */
  breakMinutes: number
  /** Break minutes in blocks of at least 15 minutes, ArbZG § 4 sentence 2. */
  countedBreakMinutes: number
  /** Longest stretch of work between two qualifying breaks. */
  longestWorkStretchMinutes: number
}

export type ComplianceRule = 'break' | 'continuousWork' | 'dailyMaximum' | 'restPeriod'

export type ComplianceWarning = {
  dateKey: string
  rule: ComplianceRule
  message: string
}

type Interval = { start: number; end: number; minutes: number; isBreak: boolean }

function toIntervals(entries: TimeEntry[], now: number): Interval[] {
  return entries
    .map((entry) => ({
      start: new Date(entry.startTime).getTime(),
      end: entry.endTime ? new Date(entry.endTime).getTime() : now,
      minutes: entryMinutes(entry, now),
      isBreak: isBreak(entry),
    }))
    .sort((left, right) => left.start - right.start)
}

/** Adjacent or overlapping break entries form a single break block. */
function mergeBreaks(sorted: Interval[]): Interval[] {
  const blocks: Interval[] = []
  for (const interval of sorted.filter((candidate) => candidate.isBreak)) {
    const previous = blocks.at(-1)
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end)
      previous.minutes = (previous.end - previous.start) / 60_000
    } else {
      blocks.push({ ...interval })
    }
  }
  return blocks
}

function summarize(
  dateKey: string,
  entries: TimeEntry[],
  limits: ComplianceLimits,
  now: number,
): WorkingDay {
  const sorted = toIntervals(entries, now)
  const work = sorted.filter((interval) => !interval.isBreak)
  const blocks = mergeBreaks(sorted)
  const qualifying = blocks.filter((block) => block.minutes >= limits.minBreakBlockMinutes)

  let stretchMinutes = 0
  let longestWorkStretchMinutes = 0
  const timeline = [...work, ...qualifying].sort((left, right) => left.start - right.start)
  for (const interval of timeline) {
    if (interval.isBreak) {
      longestWorkStretchMinutes = Math.max(longestWorkStretchMinutes, stretchMinutes)
      stretchMinutes = 0
    } else {
      stretchMinutes += interval.minutes
    }
  }

  return {
    dateKey,
    date: new Date(sorted[0].start),
    start: new Date(Math.min(...sorted.map((interval) => interval.start))),
    end: new Date(Math.max(...sorted.map((interval) => interval.end))),
    workMinutes: work.reduce((total, interval) => total + interval.minutes, 0),
    breakMinutes: blocks.reduce((total, block) => total + block.minutes, 0),
    countedBreakMinutes: qualifying.reduce((total, block) => total + block.minutes, 0),
    longestWorkStretchMinutes: Math.max(longestWorkStretchMinutes, stretchMinutes),
  }
}

/**
 * Groups entries into working days by the calendar day of their start. Break
 * entries are counted separately, they are never part of the working time.
 */
export function workingDays(
  entries: TimeEntry[],
  limits: ComplianceLimits = GERMAN_COMPLIANCE_LIMITS,
  now = Date.now(),
): WorkingDay[] {
  const days = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    const dateKey = toDateKey(new Date(entry.startTime))
    days.set(dateKey, [...(days.get(dateKey) ?? []), entry])
  }
  return [...days.entries()]
    .map(([dateKey, dayEntries]) => summarize(dateKey, dayEntries, limits, now))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
}

/** Minutes of break that the worked time of a day requires, ArbZG § 4. */
export function requiredBreakMinutes(workMinutes: number, limits: ComplianceLimits): number {
  if (workMinutes > limits.longBreakThresholdMinutes) return limits.requiredLongBreakMinutes
  if (workMinutes > limits.breakThresholdMinutes) return limits.requiredBreakMinutes
  return 0
}

function breakWarning(day: WorkingDay, limits: ComplianceLimits): ComplianceWarning | null {
  const required = requiredBreakMinutes(day.workMinutes, limits)
  if (required === 0 || day.countedBreakMinutes >= required) return null
  const ignored =
    day.breakMinutes > day.countedBreakMinutes
      ? ` Breaks shorter than ${limits.minBreakBlockMinutes} minutes do not count.`
      : ''
  return {
    dateKey: day.dateKey,
    rule: 'break',
    message: `${formatDuration(day.workMinutes)} worked with only ${formatDuration(
      day.countedBreakMinutes,
    )} of break, at least ${formatDuration(required)} are required.${ignored}`,
  }
}

function dayWarnings(
  day: WorkingDay,
  limits: ComplianceLimits,
  previous?: WorkingDay,
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = []
  const missingBreak = breakWarning(day, limits)
  if (missingBreak) warnings.push(missingBreak)
  if (day.longestWorkStretchMinutes > limits.maxContinuousWorkMinutes) {
    warnings.push({
      dateKey: day.dateKey,
      rule: 'continuousWork',
      message: `${formatDuration(
        day.longestWorkStretchMinutes,
      )} worked in a row, a break is due after ${formatDuration(
        limits.maxContinuousWorkMinutes,
      )} at the latest.`,
    })
  }
  if (day.workMinutes > limits.maxDailyWorkMinutes) {
    warnings.push({
      dateKey: day.dateKey,
      rule: 'dailyMaximum',
      message: `${formatDuration(day.workMinutes)} worked, the daily maximum is ${formatDuration(
        limits.maxDailyWorkMinutes,
      )}.`,
    })
  }
  if (previous?.end && day.start) {
    const restMinutes = (day.start.getTime() - previous.end.getTime()) / 60_000
    if (restMinutes < limits.minRestMinutes) {
      warnings.push({
        dateKey: day.dateKey,
        rule: 'restPeriod',
        message: `Only ${formatDuration(restMinutes)} of rest after ${previous.dateKey}, at least ${formatDuration(
          limits.minRestMinutes,
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
export function complianceWarnings(
  days: WorkingDay[],
  limits: ComplianceLimits = GERMAN_COMPLIANCE_LIMITS,
): ComplianceWarning[] {
  return days.flatMap((day, index) => dayWarnings(day, limits, days[index - 1]))
}

export function complianceWarningsForEntries(
  entries: TimeEntry[],
  limits: ComplianceLimits = GERMAN_COMPLIANCE_LIMITS,
  now = Date.now(),
): ComplianceWarning[] {
  return complianceWarnings(workingDays(entries, limits, now), limits)
}
