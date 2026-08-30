import { describe, expect, test } from 'vitest'
import {
  BREAK_ORDER_MESSAGE,
  DEFAULT_WORK_SETTINGS,
  GERMAN_COMPLIANCE_LIMITS,
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

  test('falls back to the German limits when none are stored', () => {
    const result = workSettingsSchema.parse({
      weeklyTargetMinutes: 2_400,
      workingDays: ['monday'],
      weekStartsOn: 'monday',
    })
    expect(result.complianceLimits).toEqual(GERMAN_COMPLIANCE_LIMITS)
  })

  test('accepts limits of another jurisdiction', () => {
    const result = workSettingsSchema.safeParse({
      ...DEFAULT_WORK_SETTINGS,
      complianceLimits: { ...GERMAN_COMPLIANCE_LIMITS, maxDailyWorkMinutes: 480 },
    })
    expect(result.success).toBe(true)
  })

  test('rejects a limit outside of a day', () => {
    const result = workSettingsSchema.safeParse({
      ...DEFAULT_WORK_SETTINGS,
      complianceLimits: { ...GERMAN_COMPLIANCE_LIMITS, minRestMinutes: 0 },
    })
    expect(result.success).toBe(false)
  })

  test('rejects a longer break that is shorter than the short one', () => {
    const result = workSettingsSchema.safeParse({
      ...DEFAULT_WORK_SETTINGS,
      complianceLimits: { ...GERMAN_COMPLIANCE_LIMITS, requiredLongBreakMinutes: 15 },
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(BREAK_ORDER_MESSAGE)
  })
})
