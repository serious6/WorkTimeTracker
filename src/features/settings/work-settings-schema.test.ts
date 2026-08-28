import { describe, expect, test } from 'vitest'
import {
  DEFAULT_WORK_SETTINGS,
  NO_WORKING_DAY_MESSAGE,
  WEEKDAY_LABELS,
  WEEKDAYS,
  workSettingsSchema,
} from './work-settings-schema'

describe('workSettingsSchema', () => {
  test('accepts valid settings', () => {
    const result = workSettingsSchema.safeParse({
      weeklyTargetMinutes: 2400,
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      weekStartsOn: 'monday',
    })
    expect(result.success).toBe(true)
  })

  test('rejects zero weeklyTargetMinutes', () => {
    const result = workSettingsSchema.safeParse({
      weeklyTargetMinutes: 0,
      workingDays: ['monday'],
      weekStartsOn: 'monday',
    })
    expect(result.success).toBe(false)
  })

  test('rejects empty workingDays with correct message', () => {
    const result = workSettingsSchema.safeParse({
      weeklyTargetMinutes: 2400,
      workingDays: [],
      weekStartsOn: 'monday',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(NO_WORKING_DAY_MESSAGE)
  })

  test('rejects invalid weekStartsOn value', () => {
    const result = workSettingsSchema.safeParse({
      weeklyTargetMinutes: 2400,
      workingDays: ['monday'],
      weekStartsOn: 'wednesday',
    })
    expect(result.success).toBe(false)
  })

  test('WEEKDAYS contains all seven days', () => {
    expect(WEEKDAYS).toHaveLength(7)
  })

  test('WEEKDAY_LABELS has entries for all weekdays', () => {
    for (const day of WEEKDAYS) {
      expect(WEEKDAY_LABELS[day]).toBeTruthy()
    }
  })

  test('DEFAULT_WORK_SETTINGS is valid', () => {
    const result = workSettingsSchema.safeParse(DEFAULT_WORK_SETTINGS)
    expect(result.success).toBe(true)
  })
})
