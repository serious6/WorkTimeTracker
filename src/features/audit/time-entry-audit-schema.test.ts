import { describe, expect, it } from 'vitest'
import { auditFieldChanges, timeEntryAuditSchema, type TimeEntryAudit } from './audit-schema'

function audit(oldValue: string | null, newValue: string | null): TimeEntryAudit {
  return timeEntryAuditSchema.parse({
    id: 1,
    timeEntryId: 7,
    action: 'updated',
    actor: 'first@example.com',
    oldValue,
    newValue,
    recordedAt: '2026-08-27T08:00:00.000Z',
  })
}

describe('timeEntryAuditSchema', () => {
  it('rejects an unknown action', () => {
    expect(() =>
      timeEntryAuditSchema.parse({
        id: 1,
        timeEntryId: 7,
        action: 'archived',
        actor: 'first@example.com',
        oldValue: null,
        newValue: null,
        recordedAt: '2026-08-27T08:00:00.000Z',
      }),
    ).toThrow()
  })

  it('reads a missing old or new value as null', () => {
    expect(audit(null, null)).toMatchObject({ oldValue: null, newValue: null })
  })
})

describe('auditFieldChanges', () => {
  it('lists only the fields that differ', () => {
    const changes = auditFieldChanges(
      audit(
        JSON.stringify({ projectId: 1, startTime: 'a', endTime: 'b', entryType: 'work' }),
        JSON.stringify({ projectId: 2, startTime: 'a', endTime: 'b', entryType: 'break' }),
      ),
    )

    expect(changes).toEqual([
      { field: 'projectId', from: '1', to: '2' },
      { field: 'entryType', from: 'work', to: 'break' },
    ])
  })

  it('shows a creation and a deletion as changes against nothing', () => {
    const created = auditFieldChanges(audit(null, JSON.stringify({ note: 'Kickoff' })))
    const deleted = auditFieldChanges(audit(JSON.stringify({ note: 'Kickoff' }), null))

    expect(created).toEqual([{ field: 'note', from: '—', to: 'Kickoff' }])
    expect(deleted).toEqual([{ field: 'note', from: 'Kickoff', to: '—' }])
  })

  it('ignores a value that is not readable JSON', () => {
    expect(auditFieldChanges(audit('not json', 'null'))).toEqual([])
  })
})
