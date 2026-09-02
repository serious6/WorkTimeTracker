import { describe, expect, it } from 'vitest'
import { roundToMinutes } from './round-duration'

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
