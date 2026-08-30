import { describe, expect, it } from 'vitest'
import { absenceIndex } from '@/features/absences/absence-index'
import type { Absence, AbsenceType } from '@/features/absences/absence-schema'
import {
  adjustedDailyTarget,
  dailyTargetMinutes,
  isWorkingDay,
  scheduledMinutesInRange,
  targetMinutesForDay,
  weekdayOf,
} from './work-schedule'
import {
  DEFAULT_WORK_SETTINGS,
  GERMAN_COMPLIANCE_LIMITS,
  NO_WORKING_DAY_MESSAGE,
  workSettingsSchema,
  type Weekday,
  type WorkSettings,
} from './work-settings-schema'

function settings(weeklyHours: number, workingDays: Weekday[]): WorkSettings {
  return { ...DEFAULT_WORK_SETTINGS, weeklyTargetMinutes: weeklyHours * 60, workingDays }
}

const MONDAY = new Date(2026, 7, 24)
const SATURDAY = new Date(2026, 7, 29)

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

describe('work settings schema', () => {
  it('defaults to a 40 hour week from Monday to Friday', () => {
    expect(DEFAULT_WORK_SETTINGS).toEqual({
      weeklyTargetMinutes: 2_400,
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      weekStartsOn: 'monday',
      complianceLimits: GERMAN_COMPLIANCE_LIMITS,
    })
    expect(dailyTargetMinutes(DEFAULT_WORK_SETTINGS)).toBe(480)
  })

  it('rejects an empty working day selection', () => {
    const result = workSettingsSchema.safeParse({ ...DEFAULT_WORK_SETTINGS, workingDays: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(NO_WORKING_DAY_MESSAGE)
  })

  it('orders and deduplicates the selected working days', () => {
    const result = workSettingsSchema.parse({
      ...DEFAULT_WORK_SETTINGS,
      workingDays: ['sunday', 'monday', 'monday'],
    })
    expect(result.workingDays).toEqual(['monday', 'sunday'])
  })

  it('rejects weekly targets outside the supported range', () => {
    expect(workSettingsSchema.safeParse({ ...DEFAULT_WORK_SETTINGS, weeklyTargetMinutes: 0 }).success).toBe(
      false,
    )
    expect(
      workSettingsSchema.safeParse({ ...DEFAULT_WORK_SETTINGS, weeklyTargetMinutes: 10_081 }).success,
    ).toBe(false)
  })
})

describe('work schedule', () => {
  it('names the weekday of a date', () => {
    expect(weekdayOf(MONDAY)).toBe('monday')
    expect(weekdayOf(SATURDAY)).toBe('saturday')
  })

  it('distributes the weekly target across the selected working days', () => {
    expect(dailyTargetMinutes(settings(40, ['monday', 'tuesday', 'wednesday', 'thursday']))).toBe(600)
    expect(dailyTargetMinutes(settings(30, ['monday', 'saturday', 'sunday']))).toBe(600)
  })

  it('has no target on days outside the schedule', () => {
    const schedule = settings(40, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
    expect(isWorkingDay(schedule, SATURDAY)).toBe(false)
    expect(targetMinutesForDay(schedule, SATURDAY)).toBe(0)
    expect(targetMinutesForDay(schedule, MONDAY)).toBe(480)
  })

  it('supports schedules that contain weekend days', () => {
    const schedule = settings(20, ['saturday', 'sunday'])
    expect(targetMinutesForDay(schedule, SATURDAY)).toBe(600)
    expect(targetMinutesForDay(schedule, MONDAY)).toBe(0)
  })

  it('sums the scheduled minutes of a date range', () => {
    const week = { start: MONDAY, end: new Date(2026, 7, 31) }
    expect(scheduledMinutesInRange(DEFAULT_WORK_SETTINGS, week)).toBe(2_400)
    expect(scheduledMinutesInRange(settings(40, ['saturday', 'sunday']), week)).toBe(2_400)
    expect(
      scheduledMinutesInRange(DEFAULT_WORK_SETTINGS, { start: MONDAY, end: new Date(2026, 7, 26) }),
    ).toBe(960)
    expect(
      scheduledMinutesInRange(DEFAULT_WORK_SETTINGS, {
        start: SATURDAY,
        end: new Date(2026, 7, 31),
      }),
    ).toBe(0)
  })

  it('recalculates targets as soon as the settings change', () => {
    expect(targetMinutesForDay(settings(40, ['monday']), MONDAY)).toBe(2_400)
    expect(targetMinutesForDay(settings(20, ['monday']), MONDAY)).toBe(1_200)
  })
})

describe('absences', () => {
  const schedule = settings(40, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])

  it('neutralises the target of a full day absence', () => {
    for (const type of ['vacation', 'sick', 'unpaid'] as const) {
      expect(targetMinutesForDay(schedule, MONDAY, absences(['2026-08-24', type]))).toBe(0)
    }
  })

  it('halves the target of a half day and rounds to whole minutes', () => {
    expect(targetMinutesForDay(schedule, MONDAY, absences(['2026-08-24', 'halfDay']))).toBe(240)
    expect(adjustedDailyTarget(461, true, 'halfDay')).toBe(231)
  })

  it('changes nothing on a day outside the schedule', () => {
    expect(targetMinutesForDay(schedule, SATURDAY, absences(['2026-08-29', 'vacation']))).toBe(0)
    expect(targetMinutesForDay(schedule, SATURDAY)).toBe(0)
  })

  it('leaves days without an absence untouched', () => {
    expect(targetMinutesForDay(schedule, MONDAY, absences(['2026-08-25', 'vacation']))).toBe(480)
  })

  it('subtracts absence days from the target of a range', () => {
    const week = { start: MONDAY, end: new Date(2026, 7, 31) }

    expect(
      scheduledMinutesInRange(
        schedule,
        week,
        absences(['2026-08-24', 'vacation'], ['2026-08-25', 'halfDay'], ['2026-08-29', 'sick']),
      ),
    ).toBe(2_400 - 480 - 240)
  })
})
