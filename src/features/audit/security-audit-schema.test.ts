import { describe, expect, it } from 'vitest'
import {
  authAuditExpiry,
  fieldDiff,
  securityAuditSchema,
  AUTH_AUDIT_RETENTION_DAYS,
} from './security-audit-schema'

describe('security audit schema', () => {
  it('reads a record without a row and without values', () => {
    const audit = securityAuditSchema.parse({
      id: 1,
      entity: 'workSettings',
      entityId: null,
      action: 'work_settings.updated',
      actor: 'first@example.com',
      oldValue: null,
      newValue: null,
      recordedAt: '2026-08-30T10:00:00.000Z',
    })

    expect(audit.entityId).toBeNull()
  })

  it('rejects an action that is not part of the policy', () => {
    const parsed = securityAuditSchema.safeParse({
      id: 1,
      entity: 'auth',
      entityId: null,
      action: 'auth.login_succeeded',
      actor: 'first@example.com',
      oldValue: null,
      newValue: null,
      recordedAt: '2026-08-30T10:00:00.000Z',
    })

    expect(parsed.success).toBe(false)
  })
})

describe('field diff', () => {
  it('keeps the changed fields only', () => {
    const diff = fieldDiff(
      { name: 'Website', color: '#22c55e', active: true },
      { name: 'Relaunch', color: '#22c55e', active: true },
    )

    expect(diff).toEqual({ oldValue: { name: 'Website' }, newValue: { name: 'Relaunch' } })
  })

  it('compares the content of a list field', () => {
    expect(fieldDiff({ workingDays: ['monday'] }, { workingDays: ['monday'] })).toBeNull()
    expect(fieldDiff({ workingDays: ['monday'] }, { workingDays: ['tuesday'] })).not.toBeNull()
  })

  it('reads a missing field as no value', () => {
    expect(fieldDiff({ note: null }, {})).toBeNull()
    expect(fieldDiff({}, { note: 'added' })).toEqual({
      oldValue: { note: null },
      newValue: { note: 'added' },
    })
  })

  it('answers nothing when no field changed, which suppresses the record', () => {
    expect(fieldDiff({ weeklyTargetMinutes: 2_400 }, { weeklyTargetMinutes: 2_400 })).toBeNull()
  })
})

describe('auth event retention', () => {
  it('expires an auth event after the retention', () => {
    const now = new Date('2026-08-30T10:00:00.000Z')
    const expiry = authAuditExpiry(now)

    expect(expiry).toBe(
      new Date(now.getTime() - AUTH_AUDIT_RETENTION_DAYS * 86_400_000).toISOString(),
    )
    expect('2026-05-01T10:00:00.000Z' < expiry).toBe(true)
    expect('2026-08-29T10:00:00.000Z' < expiry).toBe(false)
  })
})
