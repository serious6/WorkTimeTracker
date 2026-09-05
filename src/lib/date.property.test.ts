import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  combineDateAndTime,
  formatDuration,
  formatSignedDuration,
  formatStopwatch,
  fromDateKey,
  startOfDay,
  startOfWeek,
  toDateKey,
  toTimeKey,
  type WeekStart,
} from './date'

/** A range without a leap second oddity and with a four digit year. */
const date = fc.date({
  min: new Date('1970-01-01T00:00:00.000Z'),
  max: new Date('2999-12-31T23:59:59.999Z'),
  noInvalidDate: true,
})

const weekStart = fc.constantFrom<WeekStart>('monday', 'sunday')

// Local days are derived, never stored, so these have to hold in every
// timezone the app runs in, including across a daylight saving change.
describe('date key properties', () => {
  it('reads back the local day it wrote', () => {
    fc.assert(
      fc.property(date, (value) => {
        expect(fromDateKey(toDateKey(value)).getTime()).toBe(startOfDay(value).getTime())
      }),
    )
  })

  it('always writes a `YYYY-MM-DD` day and a `HH:MM` time', () => {
    fc.assert(
      fc.property(date, (value) => {
        expect(toDateKey(value)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(toTimeKey(value)).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      }),
    )
  })

  it('combines a day and a time back into the minute they came from', () => {
    fc.assert(
      fc.property(date, (value) => {
        const combined = combineDateAndTime(toDateKey(value), toTimeKey(value))
        expect(combined.getFullYear()).toBe(value.getFullYear())
        expect(combined.getMonth()).toBe(value.getMonth())
        expect(combined.getDate()).toBe(value.getDate())
        expect(combined.getHours()).toBe(value.getHours())
        expect(combined.getMinutes()).toBe(value.getMinutes())
        expect(combined.getSeconds()).toBe(0)
      }),
    )
  })
})

describe('week properties', () => {
  it('starts the week on the configured day, never later than the date itself', () => {
    fc.assert(
      fc.property(date, weekStart, (value, start) => {
        const beginning = startOfWeek(value, start)
        expect(beginning.getDay()).toBe(start === 'monday' ? 1 : 0)
        expect(beginning.getTime()).toBeLessThanOrEqual(startOfDay(value).getTime())
        expect(addDays(beginning, 7).getTime()).toBeGreaterThan(startOfDay(value).getTime())
      }),
    )
  })

  it('is stable for every day of the same week', () => {
    fc.assert(
      fc.property(date, weekStart, fc.integer({ min: 0, max: 6 }), (value, start, offset) => {
        const beginning = startOfWeek(value, start)
        expect(startOfWeek(addDays(beginning, offset), start).getTime()).toBe(beginning.getTime())
      }),
    )
  })
})

describe('duration formatting properties', () => {
  const minutes = fc.integer({ min: -100_000, max: 100_000 })

  it('always writes hours and two-digit minutes', () => {
    fc.assert(
      fc.property(minutes, (value) => {
        expect(formatDuration(value)).toMatch(/^\d+h [0-5]\dm$/)
        expect(formatSignedDuration(value)).toMatch(/^[+-]\d+h [0-5]\dm$/)
      }),
    )
  })

  it('never writes a negative duration and clamps at zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 0 }), (value) => {
        expect(formatDuration(value)).toBe('0h 00m')
      }),
    )
  })

  it('keeps the sign of a signed duration', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (value) => {
        expect(formatSignedDuration(-value)).toBe(`-${formatDuration(value)}`)
        expect(formatSignedDuration(value)).toBe(`+${formatDuration(value)}`)
      }),
    )
  })

  it('reads a stopwatch back as the second it shows', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 359_999_999 }), (milliseconds) => {
        const stopwatch = formatStopwatch(milliseconds)
        expect(stopwatch).toMatch(/^\d{2}:[0-5]\d:[0-5]\d$/)
        const [hours, minutes, seconds] = stopwatch.split(':').map(Number)
        expect(hours! * 3_600 + minutes! * 60 + seconds!).toBe(Math.floor(milliseconds / 1000))
      }),
    )
  })
})
