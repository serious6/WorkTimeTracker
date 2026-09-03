import { describe, expect, it } from 'vitest'
import { DELETED_PROJECT_NAME } from '@/features/time-entries/time-entry-schema'
import { addDays, startOfDay } from '@/lib/date'
import {
  absenceAuditRecords,
  auditListRange,
  AUDIT_RANGES,
  DEFAULT_AUDIT_RANGE,
  mergeAuditRecords,
  overtimeAuditRecords,
  securityAuditRecords,
  AUDIT_TRAIL_TYPE_LABELS,
  AUDIT_TRAIL_TYPES,
} from './audit-trails'

const NOW = new Date('2026-03-15T10:30:00.000Z')

function tomorrow(reference: Date): string {
  return addDays(startOfDay(reference), 1).toISOString()
}

describe('auditListRange', () => {
  it('offers every window the view promises, with the last 7 days as default', () => {
    expect(AUDIT_RANGES.map((range) => range.label)).toEqual([
      'Today',
      'Last 3 days',
      'Last 7 days',
      'Last 14 days',
      'Last month',
      'Always',
    ])
    expect(DEFAULT_AUDIT_RANGE).toBe('last7')
  })

  it.each([
    ['today', 0],
    ['last3', 2],
    ['last7', 6],
    ['last14', 13],
  ] as const)('starts %s at the local midnight of its first day', (id, daysBack) => {
    const range = auditListRange(id, NOW)

    expect(range?.from).toBe(addDays(startOfDay(NOW), -daysBack).toISOString())
    expect(range?.to).toBe(tomorrow(NOW))
  })

  it('reads the last month from the same day of the previous month', () => {
    const range = auditListRange('lastMonth', NOW)

    expect(range?.from).toBe(startOfDay(new Date('2026-02-15T00:00:00')).toISOString())
    expect(range?.to).toBe(tomorrow(NOW))
  })

  it('clamps the last month to the last day of a shorter month', () => {
    const range = auditListRange('lastMonth', new Date('2026-03-31T08:00:00'))

    expect(range?.from).toBe(startOfDay(new Date('2026-02-28T00:00:00')).toISOString())
  })

  it('sends no bounds for the whole history', () => {
    expect(auditListRange('always', NOW)).toBeUndefined()
  })
})

describe('audit trail records', () => {
  it('summarizes an absence audit and its changed fields', () => {
    const [record] = absenceAuditRecords([
      {
        id: 4,
        absenceId: 2,
        action: 'updated',
        actor: 'tester@example.com',
        oldValue: JSON.stringify({ type: 'vacation', date: '2026-03-10' }),
        newValue: JSON.stringify({ type: 'sick', date: '2026-03-10' }),
        recordedAt: '2026-03-11T09:00:00.000Z',
      },
    ])

    expect(record.type).toBe('absence')
    expect(record.summary).toContain('Sick leave')
    expect(record.changes).toEqual([{ field: 'Type', from: 'Vacation', to: 'Sick leave' }])
  })

  it('summarizes an overtime audit and its changed fields', () => {
    const [record] = overtimeAuditRecords([
      {
        id: 7,
        overtimeEntryId: 3,
        action: 'updated',
        actor: 'tester@example.com',
        oldValue: JSON.stringify({
          effectiveDate: '2026-03-10',
          minutes: 60,
          kind: 'adjustment',
          origin: 'manual',
          note: null,
        }),
        newValue: JSON.stringify({
          effectiveDate: '2026-03-10',
          minutes: 120,
          kind: 'adjustment',
          origin: 'manual',
          note: null,
        }),
        recordedAt: '2026-03-11T09:00:00.000Z',
      },
    ])

    expect(record.type).toBe('overtime')
    expect(record.summary).toContain('Adjustment +2h 00m')
    expect(record.changes).toEqual([{ field: 'Overtime', from: '+1h 00m', to: '+2h 00m' }])
  })

  it('merges the trails newest first', () => {
    const merged = mergeAuditRecords([
      absenceAuditRecords([
        {
          id: 1,
          absenceId: 1,
          action: 'created',
          actor: 'tester@example.com',
          oldValue: null,
          newValue: JSON.stringify({ type: 'vacation', date: '2026-03-10' }),
          recordedAt: '2026-03-10T09:00:00.000Z',
        },
      ]),
      overtimeAuditRecords([
        {
          id: 1,
          overtimeEntryId: 1,
          action: 'created',
          actor: 'tester@example.com',
          oldValue: null,
          newValue: JSON.stringify({
            effectiveDate: '2026-03-11',
            minutes: 30,
            kind: 'adjustment',
            origin: 'manual',
            note: null,
          }),
          recordedAt: '2026-03-11T09:00:00.000Z',
        },
      ]),
    ])

    expect(merged.map((record) => record.type)).toEqual(['overtime', 'absence'])
  })
})

describe('securityAuditRecords', () => {
  const projectName = (id: number | null) => (id === 7 ? 'Website Redesign' : 'Deleted project')

  function audit(overrides: Record<string, unknown>) {
    return {
      id: 1,
      entity: 'project',
      entityId: 7,
      action: 'project.updated',
      actor: 'first@example.com',
      oldValue: null,
      newValue: null,
      recordedAt: '2026-03-15T10:00:00.000Z',
      ...overrides,
    } as Parameters<typeof securityAuditRecords>[0][number]
  }

  it('offers the identity and configuration trails in the view', () => {
    expect(AUDIT_TRAIL_TYPES).toContain('identity')
    expect(AUDIT_TRAIL_TYPES).toContain('configuration')
    expect(AUDIT_TRAIL_TYPE_LABELS.identity).toBe('Identity')
  })

  it('groups an auth event under the identity trail', () => {
    const [record] = securityAuditRecords(
      [audit({ entity: 'auth', action: 'auth.locked_out', entityId: 3 })],
      projectName,
    )

    expect(record.type).toBe('identity')
    expect(record.summary).toBe('Account locked after too many failed sign ins')
    expect(record.changes).toEqual([])
  })

  it('lists the changed fields of a configuration record', () => {
    const [record] = securityAuditRecords(
      [
        audit({
          oldValue: JSON.stringify({ name: 'Website', active: true }),
          newValue: JSON.stringify({ name: 'Relaunch', active: false }),
        }),
      ],
      projectName,
    )

    expect(record.type).toBe('configuration')
    expect(record.summary).toBe('Project Relaunch')
    expect(record.changes).toEqual([
      { field: 'Name', from: 'Website', to: 'Relaunch' },
      { field: 'Active', from: 'yes', to: 'no' },
    ])
  })

  it('names the project of a budget and reads minutes as a duration', () => {
    const [record] = securityAuditRecords(
      [
        audit({
          entity: 'budget',
          action: 'budget.updated',
          entityId: 2,
          oldValue: JSON.stringify({ projectId: 7, budgetMinutes: 600 }),
          newValue: JSON.stringify({ projectId: 7, budgetMinutes: 900 }),
        }),
      ],
      projectName,
    )

    expect(record.summary).toBe('Budget for Website Redesign')
    expect(record.changes).toEqual([{ field: 'Budget', from: '10h 00m', to: '15h 00m' }])
  })

  it('keeps a record of a deleted project readable when its diff names none', () => {
    const [deleted, colored] = securityAuditRecords(
      [
        audit({
          id: 2,
          entityId: 9,
          action: 'project.deleted',
          oldValue: JSON.stringify({ name: 'Intranet' }),
        }),
        audit({
          id: 1,
          entityId: 9,
          oldValue: JSON.stringify({ color: '#22c55e' }),
          newValue: JSON.stringify({ color: '#ef4444' }),
        }),
      ],
      projectName,
    )

    // The colour change names no project, so its name is read from the record
    // of the deletion instead of reading as "Deleted project".
    expect(deleted.summary).toBe('Project Intranet')
    expect(colored.summary).toBe('Project Intranet')
  })

  it('names no project when the trail carries none', () => {
    const [project, budget] = securityAuditRecords(
      [
        audit({
          entityId: 9,
          oldValue: JSON.stringify({ color: '#22c55e' }),
          newValue: JSON.stringify({ color: '#ef4444' }),
        }),
        audit({
          id: 2,
          entity: 'budget',
          action: 'budget.updated',
          entityId: 4,
          oldValue: JSON.stringify({ budgetMinutes: 600 }),
          newValue: JSON.stringify({ budgetMinutes: 900 }),
        }),
      ],
      () => DELETED_PROJECT_NAME,
    )

    expect(project.summary).toBe('Project')
    expect(budget.summary).toBe('Budget')
  })

  it('names the project of a budget from the record that carries it', () => {
    const [updated] = securityAuditRecords(
      [
        audit({
          id: 2,
          entity: 'budget',
          action: 'budget.updated',
          entityId: 4,
          oldValue: JSON.stringify({ budgetMinutes: 600 }),
          newValue: JSON.stringify({ budgetMinutes: 900 }),
        }),
        audit({
          id: 1,
          entity: 'budget',
          action: 'budget.created',
          entityId: 4,
          newValue: JSON.stringify({ projectId: 7, budgetMinutes: 600 }),
        }),
      ],
      projectName,
    )

    expect(updated.summary).toBe('Budget for Website Redesign')
  })

  it('keeps a deleted project readable from its recorded name', () => {
    const [record] = securityAuditRecords(
      [
        audit({
          action: 'project.deleted',
          oldValue: JSON.stringify({ name: 'Website', active: true }),
        }),
      ],
      projectName,
    )

    expect(record.summary).toBe('Project Website')
    expect(record.action).toBe('project.deleted')
  })
})
