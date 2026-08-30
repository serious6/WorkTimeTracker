import { z } from 'zod'
import { addDays, fromDateKey, toDateKey } from '@/lib/date'

/**
 * Reasons why a day carries no working time target. Public holidays are not
 * covered: there is no holiday calendar to query, so a holiday is recorded as
 * one of these absences.
 */
export const ABSENCE_TYPES = ['vacation', 'sick', 'unpaid', 'halfDay'] as const

export type AbsenceType = (typeof ABSENCE_TYPES)[number]

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: 'Vacation',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
  halfDay: 'Half day',
}

export const DUPLICATE_ABSENCE_MESSAGE = 'This day already has an absence'
export const ABSENCE_RANGE_MESSAGE = 'The last day must not be before the first day'
/** A single range covers at most a year, so a typo cannot flood the record. */
export const MAX_ABSENCE_RANGE_DAYS = 366
export const ABSENCE_RANGE_LENGTH_MESSAGE = `A range covers at most ${MAX_ABSENCE_RANGE_DAYS} days`

const dateSchema = z
  .string()
  .trim()
  .min(1, 'Date is required')
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateKey(fromDateKey(value)) === value,
    'Date must be a valid calendar date',
  )

/** One absence day. A range is stored as one record per calendar day. */
export const absenceSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(ABSENCE_TYPES),
  date: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveAbsenceSchema = z.object({
  type: z.enum(ABSENCE_TYPES, { error: 'Select an absence type' }),
  date: dateSchema,
})

export type Absence = z.infer<typeof absenceSchema>
export type SaveAbsence = z.infer<typeof saveAbsenceSchema>

/** Values of the absence dialog; a single day repeats the first date. */
export const absenceFormSchema = z
  .object({
    type: z.enum(ABSENCE_TYPES, { error: 'Select an absence type' }),
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: ABSENCE_RANGE_MESSAGE,
    path: ['endDate'],
  })
  .refine(
    (values) =>
      values.endDate < values.startDate ||
      values.endDate <= toDateKey(addDays(fromDateKey(values.startDate), MAX_ABSENCE_RANGE_DAYS - 1)),
    { message: ABSENCE_RANGE_LENGTH_MESSAGE, path: ['endDate'] },
  )

export type AbsenceForm = z.infer<typeof absenceFormSchema>

/** Every calendar day of the selected range, first day first. */
export function absenceDaysOfForm(form: AbsenceForm): SaveAbsence[] {
  const days: SaveAbsence[] = []
  const end = fromDateKey(form.endDate)
  for (let day = fromDateKey(form.startDate); day <= end; day = addDays(day, 1)) {
    days.push({ type: form.type, date: toDateKey(day) })
  }
  return days
}

/** Append-only record of every change to an absence. */
export const absenceAuditSchema = z.object({
  id: z.number().int().positive(),
  absenceId: z.number().int().positive(),
  action: z.enum(['created', 'updated', 'deleted']),
  actor: z.string(),
  oldValue: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  newValue: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  recordedAt: z.string(),
})

export type AbsenceAuditAction = z.infer<typeof absenceAuditSchema>['action']
export type AbsenceAudit = z.infer<typeof absenceAuditSchema>
