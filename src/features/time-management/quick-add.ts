import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { DAY_MS, MINUTE_MS, startOfDay } from '@/lib/date'

/** Fixed quick-add durations in minutes; `1 day` uses the configured daily target. */
export const QUICK_ADD_MINUTES = [15, 30, 60] as const

/** Where a quick-added entry is placed when the day is still empty. */
export const WORK_DAY_START_HOUR = 9

export const MAX_DURATION_MINUTES = 24 * 60

const DURATION_FORMAT = /^(?:\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)?\s*)+$/iu
const DURATION_TOKEN = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)?/giu

/**
 * Parses free duration input such as `2h 45m`, `90m`, `1.5h` or `90` into
 * minutes. Values without a unit are minutes. Returns `null` when the input is
 * not a positive duration of at most one day.
 */
export function parseDurationMinutes(input: string): number | null {
  const text = input.trim()
  if (!DURATION_FORMAT.test(text)) return null

  let minutes = 0
  for (const [, amount, unit] of text.matchAll(DURATION_TOKEN)) {
    minutes += Number(amount.replace(',', '.')) * (unit?.toLowerCase().startsWith('h') ? 60 : 1)
  }

  const rounded = Math.round(minutes)
  if (rounded <= 0 || rounded > MAX_DURATION_MINUTES) return null
  return rounded
}

export type Slot = { startTime: string; endTime: string }

type Interval = { start: number; end: number }

function busyIntervals(entries: TimeEntry[], dayStart: number, dayEnd: number): Interval[] {
  return entries
    .map((entry) => ({
      start: Date.parse(entry.startTime),
      // A running entry is open ended, so it blocks everything after its start.
      end: entry.endTime ? Date.parse(entry.endTime) : Number.POSITIVE_INFINITY,
    }))
    .filter((interval) => interval.start < dayEnd && interval.end > dayStart)
    .map((interval) => ({
      start: Math.max(dayStart, interval.start),
      end: Math.min(dayEnd, interval.end),
    }))
    .sort((left, right) => left.start - right.start)
}

function freeGaps(busy: Interval[], dayStart: number, dayEnd: number): Interval[] {
  const gaps: Interval[] = []
  let cursor = dayStart
  for (const interval of busy) {
    if (interval.start > cursor) gaps.push({ start: cursor, end: interval.start })
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd })
  return gaps
}

/**
 * Finds the first free slot of `minutes` length on `date` that does not overlap
 * existing entries. Slots start at the work day start where possible, otherwise
 * in the earliest gap that is long enough. Returns `null` when the day is full.
 */
export function findFreeSlot(entries: TimeEntry[], date: Date, minutes: number): Slot | null {
  const dayStart = startOfDay(date).getTime()
  const dayEnd = dayStart + DAY_MS
  const preferred = dayStart + WORK_DAY_START_HOUR * 60 * MINUTE_MS
  const length = minutes * MINUTE_MS
  const gaps = freeGaps(busyIntervals(entries, dayStart, dayEnd), dayStart, dayEnd)

  for (const gap of gaps) {
    const start = Math.max(gap.start, preferred)
    if (gap.end - start >= length) return slot(start, length)
  }
  for (const gap of gaps) {
    if (gap.end - gap.start >= length) return slot(gap.start, length)
  }
  return null
}

function slot(start: number, length: number): Slot {
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + length).toISOString(),
  }
}
