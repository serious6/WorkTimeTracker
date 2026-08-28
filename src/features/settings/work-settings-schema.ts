import { z } from 'zod'

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
})

export type WorkSettings = z.infer<typeof workSettingsSchema>

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  weeklyTargetMinutes: 2_400,
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekStartsOn: 'monday',
}
