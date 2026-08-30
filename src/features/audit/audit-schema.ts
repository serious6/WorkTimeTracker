import { z } from 'zod'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'

/** Entity name used for the audit trail of time entries. */
export const TIME_ENTRY_ENTITY = 'timeEntry'

export const auditActionSchema = z.enum(['create', 'update', 'delete'])

export const auditLogEntrySchema = z.object({
  id: z.number().int().positive(),
  entity: z.string(),
  entityId: z.number().int().positive(),
  action: auditActionSchema,
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

export type AuditAction = z.infer<typeof auditActionSchema>
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
