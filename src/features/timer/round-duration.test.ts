import { describe, expect, it } from 'vitest'
import { MINUTE_MS } from '@/lib/date'
import { roundedStart, roundToMinutes } from './round-duration'

function elapsedMs(hours: number, minutes: number, seconds: number): number {
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

describe('roundToMinutes', () => {
  it.each([
    ['00:00:00', elapsedMs(0, 0, 0), 0],
    ['00:00:29', elapsedMs(0, 0, 29), 0],
    ['00:00:30', elapsedMs(0, 0, 30), 1],
    ['00:00:59', elapsedMs(0, 0, 59), 1],
    ['00:01:00', elapsedMs(0, 1, 0), 1],
    ['00:01:10', elapsedMs(0, 1, 10), 1],
    ['00:01:29', elapsedMs(0, 1, 29), 1],
    ['00:01:30', elapsedMs(0, 1, 30), 2],
    ['00:01:31', elapsedMs(0, 1, 31), 2],
    ['00:01:59', elapsedMs(0, 1, 59), 2],
    ['00:02:00', elapsedMs(0, 2, 0), 2],
    ['00:29:30', elapsedMs(0, 29, 30), 30],
    ['00:59:45', elapsedMs(0, 59, 45), 60],
    ['01:00:29', elapsedMs(1, 0, 29), 60],
    ['02:30:30', elapsedMs(2, 30, 30), 151],
  ])('rounds %s to whole minutes', (_label, milliseconds, expected) => {
    expect(roundToMinutes(milliseconds)).toBe(expected)
  })

  it('rounds sub-second remainders down to the seconds part', () => {
    expect(roundToMinutes(elapsedMs(0, 1, 29) + 900)).toBe(1)
  })

  it('treats negative durations as zero', () => {
    expect(roundToMinutes(-1_000)).toBe(0)
  })
})

describe('roundedStart', () => {
  const FREE = Number.NEGATIVE_INFINITY
  /** A session of 35 seconds, stored as the minute it rounds to. */
  const startMs = new Date(2026, 0, 15, 9, 0, 0).getTime()
  const stoppedAt = startMs + elapsedMs(0, 0, 35)

  it('keeps the start when the rounded segment ends before the stop', () => {
    expect(roundedStart(startMs, elapsedMs(0, 0, 30), stoppedAt, FREE)).toBe(startMs)
  })

  it('grows into the free time before the segment instead of into the future', () => {
    expect(roundedStart(startMs, MINUTE_MS, stoppedAt, FREE)).toBe(stoppedAt - MINUTE_MS)
  })

  it('stops at the entry before it and leaves the rest in the future', () => {
    expect(roundedStart(startMs, MINUTE_MS, stoppedAt, startMs)).toBe(startMs)
  })

  it('grows only as far as the entry before it allows', () => {
    const free = startMs - elapsedMs(0, 0, 10)
    expect(roundedStart(startMs, MINUTE_MS, stoppedAt, free)).toBe(free)
  })

  it('does not move tracked time into the previous day', () => {
    const afterMidnight = new Date(2026, 0, 15, 0, 0, 5).getTime()
    expect(
      roundedStart(afterMidnight, MINUTE_MS, afterMidnight + elapsedMs(0, 0, 35), FREE),
    ).toBe(new Date(2026, 0, 15).getTime())
  })
})
