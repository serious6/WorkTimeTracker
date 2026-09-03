import { z } from '@/lib/zod'

/**
 * The append-only trail of the actions that change an identity or the
 * configuration and carry no trail of their own. It is deliberately narrow:
 * only state-changing or security relevant actions are recorded, so the trail
 * stays evidence instead of a stream of routine events. Successful logins,
 * logouts, reads, exports and navigation are never recorded, and neither is
 * any credential material.
 */
export const securityAuditActionSchema = z.enum([
  'user.registered',
  'auth.login_failed',
  'auth.locked_out',
  'project.created',
  'project.updated',
  'project.deleted',
  'budget.created',
  'budget.updated',
  'budget.deleted',
  'work_settings.updated',
])

export type SecurityAuditAction = z.infer<typeof securityAuditActionSchema>

/** Entity a recorded action belongs to, used to group the trail in the view. */
export const SECURITY_AUDIT_ENTITIES = ['user', 'auth', 'project', 'budget', 'workSettings'] as const

export type SecurityAuditEntity = (typeof SECURITY_AUDIT_ENTITIES)[number]

export const securityAuditSchema = z.object({
  id: z.number().int().positive(),
  entity: z.string(),
  entityId: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? null),
  action: securityAuditActionSchema,
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

export type SecurityAudit = z.infer<typeof securityAuditSchema>

/** Auth events are evidence of an attack, not of working time: they expire. */
export const AUTH_AUDIT_RETENTION_DAYS = 90

/** The entity whose records the retention job is allowed to delete. */
export const AUTH_AUDIT_ENTITY = 'auth'

/** The moment before which an auth event has served its retention. */
export function authAuditExpiry(now = new Date()): string {
  return new Date(now.getTime() - AUTH_AUDIT_RETENTION_DAYS * 86_400_000).toISOString()
}

type Payload = Record<string, unknown>

/**
 * The fields that differ between two records, as the payload of an update: a
 * wide record is never stored as a full snapshot, only the changed fields are.
 * Answers `null` when nothing changed, which suppresses the record.
 */
export function fieldDiff(
  oldValue: Payload,
  newValue: Payload,
): { oldValue: Payload; newValue: Payload } | null {
  const changed = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].filter(
    (field) => JSON.stringify(oldValue[field] ?? null) !== JSON.stringify(newValue[field] ?? null),
  )
  if (changed.length === 0) return null
  return {
    oldValue: Object.fromEntries(changed.map((field) => [field, oldValue[field] ?? null])),
    newValue: Object.fromEntries(changed.map((field) => [field, newValue[field] ?? null])),
  }
}
