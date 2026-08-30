import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { combineDateAndTime, toTimeKey } from '@/lib/date'
import { findFreeSlot, parseDurationMinutes } from './quick-add'

const DAY = '2026-08-27'

function entry(id: number, start: string, end: string | null): TimeEntry {
  const startTime = combineDateAndTime(DAY, start).toISOString()
  return {
    id,
    projectId: 1,
    startTime,
    endTime: end ? combineDateAndTime(DAY, end).toISOString() : null,
    entryType: 'work',
    note: null,
    createdAt: startTime,
    updatedAt: startTime,
  }
}

function times(slot: { startTime: string; endTime: string } | null) {
  return slot && [toTimeKey(new Date(slot.startTime)), toTimeKey(new Date(slot.endTime))]
}

describe('parseDurationMinutes', () => {
  it.each([
    ['15', 15],
    ['90m', 90],
    ['1h', 60],
    ['1.5h', 90],
    ['1,5h', 90],
    ['2h 45m', 165],
    ['2h45m', 165],
    ['2 hours 45 minutes', 165],
    [' 30 min ', 30],
    ['8h', 480],
  ])('parses %s', (input, expected) => {
    expect(parseDurationMinutes(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-30', '0', '0h', '2h abc', '25h', '1441'])(
    'rejects %s',
    (input) => {
      expect(parseDurationMinutes(input)).toBeNull()
    },
  )
})

describe('findFreeSlot', () => {
  const date = combineDateAndTime(DAY, '00:00')

  it('starts at the work day start when the day is empty', () => {
    expect(times(findFreeSlot([], date, 15))).toEqual(['09:00', '09:15'])
  })

  it('places the entry after existing entries', () => {
    expect(times(findFreeSlot([entry(1, '09:00', '17:00')], date, 30))).toEqual(['17:00', '17:30'])
  })

  it('fills a gap between entries', () => {
    const entries = [entry(1, '09:00', '10:00'), entry(2, '11:00', '23:59')]
    expect(times(findFreeSlot(entries, date, 60))).toEqual(['10:00', '11:00'])
  })

  it('uses an earlier gap when nothing fits after the work day start', () => {
    const entries = [entry(1, '08:00', '23:59')]
    expect(times(findFreeSlot(entries, date, 60))).toEqual(['00:00', '01:00'])
  })

  it('treats a running entry as open ended', () => {
    const entries = [entry(1, '10:00', null)]
    expect(times(findFreeSlot(entries, date, 60))).toEqual(['09:00', '10:00'])
  })

  it('returns null when no gap is long enough', () => {
    expect(findFreeSlot([entry(1, '00:00', null)], date, 15)).toBeNull()
  })

  it('keeps a full day inside the selected day', () => {
    expect(times(findFreeSlot([], date, 480))).toEqual(['09:00', '17:00'])
  })
})
