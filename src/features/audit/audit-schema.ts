import { z } from '@/lib/zod'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'

/** Entity name used for the audit trail of time entries. */
export const TIME_ENTRY_ENTITY = 'timeEntry'

export const auditLogActionSchema = z.enum(['create', 'update', 'delete'])

export const auditLogEntrySchema = z.object({
  id: z.number().int().positive(),
  entity: z.string(),
  entityId: z.number().int().positive(),
  action: auditLogActionSchema,
  oldValue: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  newValue: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  createdAt: z.string(),
})

export type AuditLogAction = z.infer<typeof auditLogActionSchema>
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>

/** Snapshot of the audited time entry, stored as JSON in `oldValue`/`newValue`. */
export const auditSnapshotSchema = z.object({
  projectId: z.number().int().positive().nullable(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  note: z.string().nullable(),
})

export type AuditSnapshot = z.infer<typeof auditSnapshotSchema>

export function toSnapshot(entry: TimeEntry): AuditSnapshot {
  return {
    projectId: entry.projectId,
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note,
  }
}

export function parseSnapshot(value: string | null): AuditSnapshot | null {
  if (!value) return null
  try {
    return auditSnapshotSchema.parse(JSON.parse(value))
  } catch {
    return null
  }
}

/** Actions of the append-only record trail of a time entry or an absence. */
export const auditActionSchema = z.enum(['created', 'updated', 'deleted'])

/**
 * Append-only record of every change to a time entry. Entries stay immutable in
 * spirit: an edit keeps the previous values in `oldValue`, so the working time
 * record remains defensible.
 */
export const timeEntryAuditSchema = z.object({
  id: z.number().int().positive(),
  timeEntryId: z.number().int().positive(),
  action: auditActionSchema,
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

export type AuditAction = z.infer<typeof auditActionSchema>
export type TimeEntryAudit = z.infer<typeof timeEntryAuditSchema>

export type AuditChange = { field: string; from: string; to: string }

const AUDITED_FIELDS = ['projectId', 'startTime', 'endTime', 'entryType', 'note'] as const

function parse(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function display(value: unknown): string {
  return value === null || value === undefined ? '—' : `${value}`
}

/** Fields that differ between the recorded old and new value of an audit. */
export function auditFieldChanges(audit: TimeEntryAudit): AuditChange[] {
  const oldValue = parse(audit.oldValue)
  const newValue = parse(audit.newValue)
  return AUDITED_FIELDS.filter((field) => display(oldValue[field]) !== display(newValue[field])).map(
    (field) => ({ field, from: display(oldValue[field]), to: display(newValue[field]) }),
  )
}
