import { z } from '@/lib/zod'

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const NO_WORKING_DAY_MESSAGE = 'Select at least one working day'
export const INVALID_LIMIT_MESSAGE = 'Enter working time limits between 1 minute and 24 hours'
export const BREAK_ORDER_MESSAGE =
  'The long break threshold and duration must not be below the short ones'

const limitMinutes = z.coerce.number().int().min(1).max(1_440)

/**
 * Legal limits of the working time record. The defaults follow the German
 * ArbZG; other jurisdictions adjust them in the settings.
 */
export const complianceLimitsSchema = z
  .object({
    /** Working time above which a break is required, ArbZG § 4 sentence 1. */
    breakThresholdMinutes: limitMinutes,
    requiredBreakMinutes: limitMinutes,
    /** Working time above which the longer break is required. */
    longBreakThresholdMinutes: limitMinutes,
    requiredLongBreakMinutes: limitMinutes,
    /** Shortest block that counts as a break, ArbZG § 4 sentence 2. */
    minBreakBlockMinutes: limitMinutes,
    /** Longest permitted stretch of work without a break, ArbZG § 4 sentence 3. */
    maxContinuousWorkMinutes: limitMinutes,
    /** Daily maximum working time, ArbZG § 3. */
    maxDailyWorkMinutes: limitMinutes,
    /** Uninterrupted rest between two working days, ArbZG § 5. */
    minRestMinutes: limitMinutes,
  })
  .refine(
    (limits) =>
      limits.longBreakThresholdMinutes >= limits.breakThresholdMinutes &&
      limits.requiredLongBreakMinutes >= limits.requiredBreakMinutes,
    BREAK_ORDER_MESSAGE,
  )

export type ComplianceLimits = z.infer<typeof complianceLimitsSchema>

/** German ArbZG limits, also the value the settings are restored to. */
export const GERMAN_COMPLIANCE_LIMITS: ComplianceLimits = {
  breakThresholdMinutes: 360,
  requiredBreakMinutes: 30,
  longBreakThresholdMinutes: 540,
  requiredLongBreakMinutes: 45,
  minBreakBlockMinutes: 15,
  maxContinuousWorkMinutes: 360,
  maxDailyWorkMinutes: 600,
  minRestMinutes: 660,
}

/**
 * General settings of the application. New settings are added as further fields
 * of this schema and are persisted in the single `work_settings` record.
 */
export const workSettingsSchema = z.object({
  weeklyTargetMinutes: z.coerce.number().int().min(1).max(10_080),
  workingDays: z
    .array(z.enum(WEEKDAYS))
    .min(1, NO_WORKING_DAY_MESSAGE)
    .transform((days) => WEEKDAYS.filter((day) => days.includes(day))),
  weekStartsOn: z.enum(['monday', 'sunday']),
  complianceLimits: complianceLimitsSchema.default(GERMAN_COMPLIANCE_LIMITS),
})

export type WorkSettings = z.infer<typeof workSettingsSchema>
/** Settings as they are submitted; omitted limits fall back to the defaults. */
export type SaveWorkSettings = Omit<WorkSettings, 'complianceLimits'> & {
  complianceLimits?: ComplianceLimits
}

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  weeklyTargetMinutes: 2_400,
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekStartsOn: 'monday',
  complianceLimits: GERMAN_COMPLIANCE_LIMITS,
}
