import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { findOverlap } from './overlap'
import type { TimeEntry } from './time-entry-schema'

const DAY_START = Date.parse('2026-08-27T00:00:00.000Z')

/** Minutes after a fixed day start as the canonical UTC timestamp of an entry. */
function at(minute: number): string {
  return new Date(DAY_START + minute * 60_000).toISOString()
}

function entry(id: number, start: number, end: number | null): TimeEntry {
  return {
    id,
    projectId: 1,
    startTime: at(start),
    endTime: end === null ? null : at(end),
    entryType: 'work',
    note: null,
    createdAt: at(start),
    updatedAt: at(start),
  }
}

/** Half-open intervals: two entries that only touch do not overlap. */
function intersects(
  [start, end]: [number, number],
  [otherStart, otherEnd]: [number, number],
): boolean {
  return otherStart < end && otherEnd > start
}

const minute = fc.integer({ min: 0, max: 1_439 })
const length = fc.integer({ min: 1, max: 240 })

/** A closed entry always ends after it starts, an open one is still running. */
const interval = fc
  .tuple(minute, fc.option(length, { nil: null }))
  .map(([start, minutes]): [number, number] => [
    start,
    minutes === null ? Number.POSITIVE_INFINITY : start + minutes,
  ])

describe('findOverlap properties', () => {
  it('agrees with the half-open interval definition', () => {
    fc.assert(
      fc.property(fc.array(interval, { maxLength: 8 }), interval, (existing, [start, end]) => {
        const entries = existing.map(([entryStart, entryEnd], index) =>
          entry(index + 1, entryStart, Number.isFinite(entryEnd) ? entryEnd : null),
        )
        const expected = existing.findIndex((other) => intersects(other, [start, end]))
        const found = findOverlap(entries, {
          startTime: at(start),
          endTime: Number.isFinite(end) ? at(end) : null,
        })
        expect(found?.id ?? null).toBe(expected < 0 ? null : expected + 1)
      }),
    )
  })

  it('never reports an entry that only touches the candidate', () => {
    fc.assert(
      fc.property(minute, length, length, (start, before, after) => {
        const end = start + after
        const neighbours = [entry(1, start - before, start), entry(2, end, end + before)]
        expect(findOverlap(neighbours, { startTime: at(start), endTime: at(end) })).toBeUndefined()
      }),
    )
  })

  it('treats a running entry as blocking everything that starts after it', () => {
    fc.assert(
      fc.property(minute, length, (start, offset) => {
        const running = [entry(1, start, null)]
        expect(findOverlap(running, { startTime: at(start + offset), endTime: null })).toBe(
          running[0],
        )
      }),
    )
  })

  it('never reports the entry that is being edited', () => {
    fc.assert(
      fc.property(interval, ([start, end]) => {
        const edited = entry(7, start, Number.isFinite(end) ? end : null)
        expect(
          findOverlap([edited], { startTime: at(start), endTime: null }, edited.id),
        ).toBeUndefined()
      }),
    )
  })
})
