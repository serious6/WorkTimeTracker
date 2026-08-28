import { describe, expect, it } from 'vitest'
import {
  addDays,
  combineDateAndTime,
  formatDay,
  formatDuration,
  formatShortDay,
  formatSignedDuration,
  formatStopwatch,
  formatTimeOfDay,
  formatWeekRange,
  fromDateKey,
  startOfDay,
  startOfWeek,
  toDateKey,
  toTimeKey,
} from './date'

describe('calendar helpers', () => {
  it('cuts a date back to midnight without changing the day', () => {
    expect(startOfDay(new Date(2026, 7, 28, 23, 59, 59, 999))).toEqual(new Date(2026, 7, 28))
  })

  it('shifts days across month and year boundaries', () => {
    expect(addDays(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 1))
    expect(addDays(new Date(2026, 0, 1), -1)).toEqual(new Date(2025, 11, 31))
  })

  it('keeps the local day when shifting over a daylight saving change', () => {
    expect(addDays(new Date(2026, 2, 28, 12), 2).getDate()).toBe(30)
  })

  it('starts the week on the configured weekday', () => {
    const wednesday = new Date(2026, 7, 26, 15)

    expect(startOfWeek(wednesday)).toEqual(new Date(2026, 7, 24))
    expect(startOfWeek(wednesday, 'sunday')).toEqual(new Date(2026, 7, 23))
  })

  it('treats sunday as the last day of a week starting on monday', () => {
    expect(startOfWeek(new Date(2026, 7, 30))).toEqual(new Date(2026, 7, 24))
    expect(startOfWeek(new Date(2026, 7, 30), 'sunday')).toEqual(new Date(2026, 7, 30))
  })
})

describe('date and time keys', () => {
  it('pads month and day of a local date key', () => {
    expect(toDateKey(new Date(2026, 0, 5, 22))).toBe('2026-01-05')
  })

  it('round-trips a date key through the local calendar', () => {
    expect(toDateKey(fromDateKey('2026-08-28'))).toBe('2026-08-28')
    expect(fromDateKey('2026-08-28')).toEqual(new Date(2026, 7, 28))
  })

  it('formats the time of day for a time input', () => {
    expect(toTimeKey(new Date(2026, 7, 28, 9, 5))).toBe('09:05')
    expect(toTimeKey(new Date(2026, 7, 28, 23, 45))).toBe('23:45')
  })

  it('combines a date key and a time key into a local date', () => {
    expect(combineDateAndTime('2026-08-28', '14:30')).toEqual(new Date(2026, 7, 28, 14, 30))
  })

  it('clears seconds and milliseconds when combining', () => {
    const combined = combineDateAndTime('2026-08-28', '14:30')

    expect(combined.getSeconds()).toBe(0)
    expect(combined.getMilliseconds()).toBe(0)
  })
})

describe('display formatting', () => {
  it('formats single days', () => {
    expect(formatDay(new Date(2026, 7, 28))).toBe('August 28, 2026')
    expect(formatShortDay(new Date(2026, 7, 28))).toBe('Aug 28')
  })

  it('formats a week range from its first day', () => {
    expect(formatWeekRange(new Date(2026, 7, 24))).toBe('Aug 24 – Aug 30, 2026')
  })

  it('takes the year of the last day of a week that spans new year', () => {
    expect(formatWeekRange(new Date(2026, 11, 28))).toBe('Dec 28 – Jan 3, 2027')
  })

  it('formats the time of day', () => {
    expect(formatTimeOfDay(new Date(2026, 7, 28, 9, 5))).toBe('9:05 AM')
  })
})

describe('duration formatting', () => {
  it('splits minutes into hours and padded minutes', () => {
    expect(formatDuration(0)).toBe('0h 00m')
    expect(formatDuration(465)).toBe('7h 45m')
    expect(formatDuration(60)).toBe('1h 00m')
  })

  it('rounds fractional minutes and clamps negative input', () => {
    expect(formatDuration(59.6)).toBe('1h 00m')
    expect(formatDuration(-30)).toBe('0h 00m')
  })

  it('prefixes signed durations', () => {
    expect(formatSignedDuration(375)).toBe('+6h 15m')
    expect(formatSignedDuration(-375)).toBe('-6h 15m')
    expect(formatSignedDuration(0)).toBe('+0h 00m')
  })

  it('formats a stopwatch with two digit parts', () => {
    expect(formatStopwatch(0)).toBe('00:00:00')
    expect(formatStopwatch(5_027_000)).toBe('01:23:47')
    expect(formatStopwatch(999)).toBe('00:00:00')
  })

  it('keeps the stopwatch at zero for negative input', () => {
    expect(formatStopwatch(-5_000)).toBe('00:00:00')
  })

  it('counts hours beyond a day instead of wrapping', () => {
    expect(formatStopwatch(90_000_000)).toBe('25:00:00')
  })
})
