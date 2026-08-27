import { z } from 'zod'

export const newTimeEntrySchema = z.object({
  project: z.string().trim().min(1, 'Project is required').max(100),
  durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
  notes: z.string().trim().max(500).optional(),
})

export const timeEntrySchema = newTimeEntrySchema.extend({
  id: z.number().int().positive(),
  startedAt: z.string(),
  endedAt: z.string(),
})

export type NewTimeEntry = z.infer<typeof newTimeEntrySchema>
export type TimeEntry = z.infer<typeof timeEntrySchema>
