import { describe, expect, it } from 'vitest'
import { absenceIndex } from '@/features/absences/absence-index'
import type { Absence, AbsenceType } from '@/features/absences/absence-schema'
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

function absences(...days: [string, AbsenceType][]) {
  return absenceIndex(
    days.map<Absence>(([date, type], index) => ({
      id: index + 1,
      type,
      date,
      createdAt: date,
      updatedAt: date,
    })),
  )
}

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

describe('cumulative balance with absences', () => {
  const entries = [entry(1, at(17, 8), at(17, 16))] // Monday, exactly the target.

  it('keeps the balance unchanged across a vacation range', () => {
    const vacation = absences(
      ['2026-08-18', 'vacation'],
      ['2026-08-19', 'vacation'],
      ['2026-08-20', 'vacation'],
      ['2026-08-21', 'vacation'],
    )
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(21, 18),
      absences: vacation,
      now: at(21, 18).getTime(),
    })

    expect(balance.targetMinutes).toBe(480)
    expect(balance.balanceMinutes).toBe(0)
  })

  it('still expects half of the target on a half day', () => {
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(18, 18),
      absences: absences(['2026-08-18', 'halfDay']),
      now: at(18, 18).getTime(),
    })

    expect(balance.targetMinutes).toBe(720)
    expect(balance.balanceMinutes).toBe(-240)
  })

  it('ignores an absence on a day outside the schedule', () => {
    const balance = cumulativeBalance({
      entries,
      settings,
      throughDate: at(22, 18), // Saturday
      absences: absences(['2026-08-22', 'vacation']),
      now: at(22, 18).getTime(),
    })

    expect(balance.targetMinutes).toBe(2_400)
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
