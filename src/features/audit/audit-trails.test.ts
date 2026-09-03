import { describe, expect, it } from 'vitest'
import { addDays, startOfDay } from '@/lib/date'
import {
  absenceAuditRecords,
  auditListRange,
  AUDIT_RANGES,
  DEFAULT_AUDIT_RANGE,
  mergeAuditRecords,
  overtimeAuditRecords,
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
