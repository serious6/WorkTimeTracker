import { z } from 'zod'
import { combineDateAndTime, toDateKey, toTimeKey } from '@/lib/date'

export const OVERLAP_MESSAGE = 'This time overlaps with another time entry'
export const ORDER_MESSAGE = 'End time must be later than start time'
export const TIMER_ERROR_MESSAGE = 'Unable to start the timer. Please try again'
export const DELETED_PROJECT_NAME = 'Deleted project'

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

export const timeEntrySchema = z.object({
  id: z.number().int().positive(),
  projectId: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? null),
  startTime: z.string(),
  endTime: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  note: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveTimeEntrySchema = z.object({
  projectId: z.number().int().positive().nullable(),
  startTime: z.string().refine(isCanonicalTimestamp, 'Invalid start time'),
  endTime: z.string().refine(isCanonicalTimestamp, 'Invalid end time').nullable(),
  note: z.string().trim().max(500).nullable(),
}).refine((entry) => !entry.endTime || entry.endTime > entry.startTime, {
  message: ORDER_MESSAGE,
  path: ['endTime'],
})

export type TimeEntry = z.infer<typeof timeEntrySchema>
export type SaveTimeEntry = z.infer<typeof saveTimeEntrySchema>

/** Values of the manual time entry dialog. */
export const timeEntryFormSchema = z
  .object({
    projectId: z.coerce.number({ error: 'Project is required' }).int().positive('Project is required'),
    date: z.string().min(1, 'Date is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (values) =>
      combineDateAndTime(values.date, values.endTime) >
      combineDateAndTime(values.date, values.startTime),
    { message: ORDER_MESSAGE, path: ['endTime'] },
  )

export type TimeEntryForm = z.infer<typeof timeEntryFormSchema>

export function formToSaveTimeEntry(form: TimeEntryForm): SaveTimeEntry {
  return {
    projectId: form.projectId,
    startTime: combineDateAndTime(form.date, form.startTime).toISOString(),
    endTime: combineDateAndTime(form.date, form.endTime).toISOString(),
    note: form.note?.trim() || null,
  }
}

export function entryToForm(entry: TimeEntry): TimeEntryForm {
  const start = new Date(entry.startTime)
  const end = entry.endTime ? new Date(entry.endTime) : new Date()
  return {
    projectId: entry.projectId ?? 0,
    date: toDateKey(start),
    startTime: toTimeKey(start),
    endTime: toTimeKey(end),
    note: entry.note ?? undefined,
  }
}
