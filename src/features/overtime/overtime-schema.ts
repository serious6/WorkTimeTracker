import { z } from 'zod'
import { fromDateKey, toDateKey } from '@/lib/date'

/**
 * How an explicit overtime record is meant: the balance that was carried over
 * from before the application was used, an absolute correction of the balance,
 * or a delta on top of it.
 */
export const OVERTIME_KINDS = ['opening', 'balance', 'adjustment'] as const

export type OvertimeKind = (typeof OVERTIME_KINDS)[number]

export const OVERTIME_KIND_LABELS: Record<OvertimeKind, string> = {
  opening: 'Opening balance',
  balance: 'Corrected balance',
  adjustment: 'Adjustment',
}

/**
 * Where a record came from. Rows written by the application from the time
 * entries are `automatic`, rows entered or edited by the user are `manual` and
 * are never overwritten by the automatic calculation again.
 */
export const OVERTIME_ORIGINS = ['automatic', 'manual'] as const

export type OvertimeOrigin = (typeof OVERTIME_ORIGINS)[number]

export const OVERTIME_ORIGIN_LABELS: Record<OvertimeOrigin, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
}

export const DUPLICATE_OVERTIME_MESSAGE = 'This date already has an overtime record'
export const SINGLE_OPENING_MESSAGE = 'Only one opening balance can be set'
/** A record covers at most a year of overtime, so a typo cannot distort the balance. */
export const MAX_OVERTIME_MINUTES = 525_600
export const OVERTIME_VALUE_MESSAGE = 'Enter a duration such as 2h 30m, 90m or -1h 15m'
export const OVERTIME_RANGE_MESSAGE = 'Overtime must stay within a year of minutes'
export const OVERTIME_NOTE_MESSAGE = 'Note must be at most 500 characters'

const dateSchema = z
  .string()
  .trim()
  .min(1, 'Effective date is required')
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateKey(fromDateKey(value)) === value,
    'Effective date must be a valid calendar date',
  )

const noteSchema = z
  .string()
  .trim()
  .max(500, OVERTIME_NOTE_MESSAGE)
  .nullish()
  .transform((value) => value?.trim() || null)

/** One explicit overtime record; the derived overtime is never stored. */
export const overtimeEntrySchema = z.object({
  id: z.number().int().positive(),
  effectiveDate: z.string(),
  minutes: z.number().int(),
  kind: z.enum(OVERTIME_KINDS),
  origin: z.enum(OVERTIME_ORIGINS),
  note: noteSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const saveOvertimeEntrySchema = z.object({
  effectiveDate: dateSchema,
  minutes: z
    .number({ error: 'Overtime is required' })
    .int('Overtime must be whole minutes')
    .min(-MAX_OVERTIME_MINUTES, OVERTIME_RANGE_MESSAGE)
    .max(MAX_OVERTIME_MINUTES, OVERTIME_RANGE_MESSAGE),
  kind: z.enum(OVERTIME_KINDS, { error: 'Select an overtime type' }),
  origin: z.enum(OVERTIME_ORIGINS, { error: 'Select an origin' }).default('manual'),
  note: noteSchema,
})

export type OvertimeEntry = z.infer<typeof overtimeEntrySchema>
export type SaveOvertimeEntry = z.infer<typeof saveOvertimeEntrySchema>

// Sticky token matching keeps the scan linear, unlike a repeated group.
const OVERTIME_TOKEN = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)?\s*/yiu

/**
 * Parses overtime input such as `2h 30m`, `90m`, `1.5h`, `90` or `-1h 15m`
 * into minutes. Values without a unit are minutes, a leading sign is kept, so
 * undertime can be entered as a negative value. Returns `null` when the input
 * is not a duration within `MAX_OVERTIME_MINUTES`.
 */
export function parseOvertimeMinutes(input: string): number | null {
  const trimmed = input.trim()
  const sign = trimmed.startsWith('-') ? -1 : 1
  const text = /^[+-]/.test(trimmed) ? trimmed.slice(1).trim() : trimmed
  if (!text) return null

  let minutes = 0
  OVERTIME_TOKEN.lastIndex = 0
  while (OVERTIME_TOKEN.lastIndex < text.length) {
    const match = OVERTIME_TOKEN.exec(text)
    if (!match || !match[0]) return null
    minutes +=
      Number(match[1].replace(',', '.')) * (match[2]?.toLowerCase().startsWith('h') ? 60 : 1)
  }

  const rounded = Math.round(minutes) * sign
  if (Math.abs(rounded) > MAX_OVERTIME_MINUTES) return null
  return rounded
}

/** Values of the overtime form; the value is entered in hours and minutes. */
export const overtimeFormSchema = z.object({
  effectiveDate: dateSchema,
  kind: z.enum(OVERTIME_KINDS, { error: 'Select an overtime type' }),
  value: z
    .string()
    .trim()
    .min(1, 'Overtime is required')
    .refine((value) => parseOvertimeMinutes(value) !== null, OVERTIME_VALUE_MESSAGE),
  note: z.string().trim().max(500, OVERTIME_NOTE_MESSAGE),
})

export type OvertimeForm = z.infer<typeof overtimeFormSchema>

/** A record entered by the user is always `manual`, never `automatic`. */
export function formToSaveOvertimeEntry(form: OvertimeForm): SaveOvertimeEntry {
  return {
    effectiveDate: form.effectiveDate,
    minutes: parseOvertimeMinutes(form.value) ?? 0,
    kind: form.kind,
    origin: 'manual',
    note: form.note.trim() || null,
  }
}

/** Append-only record of every change to an overtime record. */
export const overtimeAuditSchema = z.object({
  id: z.number().int().positive(),
  overtimeEntryId: z.number().int().positive(),
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

export type OvertimeAudit = z.infer<typeof overtimeAuditSchema>
