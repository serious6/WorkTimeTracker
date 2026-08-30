import { describe, expect, it } from 'vitest'
import { DEFAULT_WORK_SETTINGS } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { cumulativeBalance, trackedMinutesByDay } from './balance'

function entry(id: number, start: Date, end: Date | null): TimeEntry {
  return {
    id,
    projectId: 1,
    startTime: start.toISOString(),
    endTime: end?.toISOString() ?? null,
    entryType: 'work',
    note: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  }
}

function breakEntry(id: number, start: Date, end: Date): TimeEntry {
  return { ...entry(id, start, end), projectId: null, entryType: 'break' }
}

// August 2026: the 17th is a Monday, the 24th the Monday of the following week.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, day, hour, minute)
const settings = DEFAULT_WORK_SETTINGS

describe('cumulative balance', () => {
  it('is empty without any tracked time', () => {
    const balance = cumulativeBalance({
      entries: [],
      settings,
      throughDate: at(24, 12),
      now: at(24, 12).getTime(),
    })

    expect(balance.startDate).toBeNull()
    expect(balance.balanceMinutes).toBe(0)
  })

  it('carries the balance across weeks instead of resetting it', () => {
    const entries = [
      entry(1, at(17, 8), at(17, 18)), // Monday, 10h -> +2h
      entry(2, at(24, 9), at(24, 13)), // Monday next week, 4h -> -4h
    ]
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(24, 13),
      now: at(24, 13).getTime(),
    })

    // Six working days (Mon–Fri plus the following Monday) at 8h target each.
    expect(balance.targetMinutes).toBe(2_880)
    expect(balance.trackedMinutes).toBe(840)
    expect(balance.balanceMinutes).toBe(840 - 2_880)
    expect(balance.carriedOverMinutes).toBe(600 - 2_400)
  })

  it('does not count days after today', () => {
    const entries = [entry(1, at(17, 8), at(17, 16))]
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(31, 12),
      now: at(17, 16).getTime(),
    })

    expect(balance.targetMinutes).toBe(480)
    expect(balance.balanceMinutes).toBe(0)
  })

  it('counts the elapsed time of a running entry', () => {
    const entries = [entry(1, at(17, 8), null)]
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(17, 12),
      now: at(17, 12).getTime(),
    })

    expect(balance.trackedMinutes).toBe(240)
    expect(balance.balanceMinutes).toBe(-240)
  })

  it('ignores days before the first tracked day', () => {
    const entries = [entry(1, at(24, 8), at(24, 16))]
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(24, 16),
      now: at(24, 16).getTime(),
    })

    expect(balance.startDate?.getDate()).toBe(24)
    expect(balance.balanceMinutes).toBe(0)
  })
})

describe('trackedMinutesByDay', () => {
  it('splits entries that span midnight', () => {
    const minutes = trackedMinutesByDay([entry(1, at(17, 23), at(18, 1))], at(18, 2).getTime())

    expect(minutes.get('2026-08-17')).toBe(60)
    expect(minutes.get('2026-08-18')).toBe(60)
  })

  it('does not include breaks in daily tracked time', () => {
    const minutes = trackedMinutesByDay(
      [entry(1, at(17, 8), at(17, 9)), breakEntry(2, at(17, 9), at(17, 10))],
      at(17, 10).getTime(),
    )

    expect(minutes.get('2026-08-17')).toBe(60)
  })
})
