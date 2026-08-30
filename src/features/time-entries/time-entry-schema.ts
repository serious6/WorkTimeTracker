import { z } from 'zod'
import { combineDateAndTime, toDateKey, toTimeKey } from '@/lib/date'

export const OVERLAP_MESSAGE = 'This time overlaps with another time entry'
export const ORDER_MESSAGE = 'End time must be later than start time'
export const FUTURE_START_MESSAGE = 'The start time cannot be in the future'
export const TIMER_ERROR_MESSAGE = 'Unable to start the timer. Please try again'
export const DELETED_PROJECT_NAME = 'Deleted project'
export const BREAK_PROJECT_MESSAGE = 'A break is not booked on a project'
export const BREAK_LABEL = 'Break'

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

export const entryTypeSchema = z.enum(['work', 'break'])

export type EntryType = z.infer<typeof entryTypeSchema>

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
  entryType: entryTypeSchema.nullish().transform((value) => value ?? 'work'),
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
  /** Omitted input records work, breaks have to be requested explicitly. */
  entryType: entryTypeSchema.optional(),
  note: z.string().trim().max(500).nullable(),
})
  .refine((entry) => !entry.endTime || entry.endTime > entry.startTime, {
    message: ORDER_MESSAGE,
    path: ['endTime'],
  })
  .refine((entry) => entry.entryType !== 'break' || entry.projectId === null, {
    message: BREAK_PROJECT_MESSAGE,
    path: ['projectId'],
  })

export type TimeEntry = z.infer<typeof timeEntrySchema>
export type SaveTimeEntry = z.infer<typeof saveTimeEntrySchema>

/** Breaks are recorded as entries of their own, never as gaps between entries. */
export function isBreak(entry: { entryType: EntryType }): boolean {
  return entry.entryType === 'break'
}

/** Normalises common time-of-day shorthand to the canonical `HH:MM` form. */
export function parseTimeOfDay(value: string): string | undefined {
  const input = value.trim().toLowerCase()
  let hours: number
  let minutes: number
  const decimal = input.match(/^(\d{1,2})(?:[.,](\d+))h$/)
  const colon = input.match(/^(\d{1,2}):(\d{1,2})$/)
  const compact = input.match(/^(\d{2})(\d{2})$/)

  if (decimal) {
    hours = Number(decimal[1])
    minutes = Math.round(Number(`0.${decimal[2]}`) * 60)
  } else if (colon) {
    hours = Number(colon[1])
    minutes = Number(colon[2])
  } else if (compact) {
    hours = Number(compact[1])
    minutes = Number(compact[2])
  } else if (/^\d{1,2}$/.test(input)) {
    hours = Number(input)
    minutes = 0
  } else {
    return undefined
  }

  if (hours > 23 || minutes > 59) return undefined
  return `${hours}`.padStart(2, '0') + ':' + `${minutes}`.padStart(2, '0')
}

const timeOfDaySchema = z.string().transform((value, context) => {
  const parsed = parseTimeOfDay(value)
  if (!parsed) {
    context.addIssue({ code: 'custom', message: 'Enter a valid time' })
    return z.NEVER
  }
  return parsed
})

/** Values of the manual time entry dialog. */
export const timeEntryFormSchema = z
  .object({
    entryType: entryTypeSchema.nullish().transform((value) => value ?? 'work'),
    projectId: z.coerce
      .number({ error: 'Project is required' })
      .int()
      .positive('Project is required')
      .nullish()
      .transform((value) => value ?? null),
    date: z.string().min(1, 'Date is required'),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine((values) => values.entryType === 'break' || values.projectId !== null, {
    message: 'Project is required',
    path: ['projectId'],
  })
  .refine((values) => values.entryType === 'work' || values.projectId === null, {
    message: BREAK_PROJECT_MESSAGE,
    path: ['projectId'],
  })
  .refine(
    (values) =>
      combineDateAndTime(values.date, values.endTime) >
      combineDateAndTime(values.date, values.startTime),
    { message: ORDER_MESSAGE, path: ['endTime'] },
  )

export type TimeEntryForm = z.infer<typeof timeEntryFormSchema>
export type TimeEntryFormValues = Omit<TimeEntryForm, 'projectId'> & {
  projectId: number | undefined
}

export function formToSaveTimeEntry(form: TimeEntryForm): SaveTimeEntry {
  return {
    projectId: form.projectId,
    startTime: combineDateAndTime(form.date, form.startTime).toISOString(),
    endTime: combineDateAndTime(form.date, form.endTime).toISOString(),
    entryType: form.entryType,
    note: form.note?.trim() || null,
  }
}

export function entryToForm(entry: TimeEntry): TimeEntryFormValues {
  const start = new Date(entry.startTime)
  const end = entry.endTime ? new Date(entry.endTime) : new Date()
  return {
    entryType: entry.entryType,
    projectId: entry.projectId ?? undefined,
    date: toDateKey(start),
    startTime: toTimeKey(start),
    endTime: toTimeKey(end),
    note: entry.note ?? undefined,
  }
}
