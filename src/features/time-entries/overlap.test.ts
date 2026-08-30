import { describe, expect, it } from 'vitest'
import { findOverlap } from './overlap'
import type { TimeEntry } from './time-entry-schema'

function entry(id: number, startTime: string, endTime: string | null): TimeEntry {
  return {
    id,
    projectId: 1,
    startTime,
    endTime,
    entryType: 'work',
    note: null,
    createdAt: startTime,
    updatedAt: startTime,
  }
}

const existing = [entry(1, '2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z')]

describe('findOverlap', () => {
  it('detects entries that share time with an existing entry', () => {
    expect(
      findOverlap(existing, {
        startTime: '2026-08-27T08:30:00.000Z',
        endTime: '2026-08-27T09:30:00.000Z',
      }),
    ).toBe(existing[0])
  })

  it('allows entries that only touch the boundary', () => {
    expect(
      findOverlap(existing, {
        startTime: '2026-08-27T09:00:00.000Z',
        endTime: '2026-08-27T10:00:00.000Z',
      }),
    ).toBeUndefined()
  })

  it('ignores the entry that is being edited', () => {
    expect(
      findOverlap(
        existing,
        { startTime: '2026-08-27T08:15:00.000Z', endTime: '2026-08-27T08:45:00.000Z' },
        1,
      ),
    ).toBeUndefined()
  })

  it('treats a running entry as open ended', () => {
    const running = [entry(2, '2026-08-27T08:00:00.000Z', null)]
    expect(
      findOverlap(running, {
        startTime: '2026-08-27T20:00:00.000Z',
        endTime: '2026-08-27T21:00:00.000Z',
      }),
    ).toBe(running[0])
  })
})
