import { z } from 'zod'

export const workSettingsSchema = z.object({
  dailyTargetMinutes: z.coerce.number().int().min(1).max(1_440),
  weeklyTargetMinutes: z.coerce.number().int().min(1).max(10_080),
  weekStartsOn: z.enum(['monday', 'sunday']),
})

export type WorkSettings = z.infer<typeof workSettingsSchema>

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  dailyTargetMinutes: 480,
  weeklyTargetMinutes: 2_400,
  weekStartsOn: 'monday',
}
