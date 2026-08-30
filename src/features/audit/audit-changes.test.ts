import { describe, expect, it } from 'vitest'
import { auditChanges, auditSummary, AUDIT_ACTION_LABEL, formatMoment } from './audit-changes'
import { parseSnapshot, toSnapshot, type AuditSnapshot } from './audit-schema'

const snapshot: AuditSnapshot = {
  projectId: 1,
  startTime: '2026-08-27T08:00:00.000Z',
  endTime: '2026-08-27T09:00:00.000Z',
  note: 'Kickoff',
}

const projectName = (projectId: number | null) => (projectId === 1 ? 'Website' : 'Mobile')

describe('audit changes', () => {
  it('labels every recorded action', () => {
    expect(AUDIT_ACTION_LABEL.create).toBe('Created')
    expect(AUDIT_ACTION_LABEL.update).toBe('Edited')
    expect(AUDIT_ACTION_LABEL.delete).toBe('Deleted')
  })

  it('reports a running entry instead of an end time', () => {
    expect(formatMoment(null)).toBe('running')
    expect(formatMoment(snapshot.startTime)).toMatch(/Aug 27/)
  })

  it('summarizes an entry with project and times', () => {
    expect(auditSummary(snapshot, projectName)).toContain('Website')
    expect(auditSummary(null, projectName)).toBe('')
  })

  it('lists only the fields that differ', () => {
    const changes = auditChanges(
      snapshot,
      { ...snapshot, projectId: 2, endTime: '2026-08-27T10:00:00.000Z', note: null },
      projectName,
    )
    expect(changes.map((change) => change.field)).toEqual(['Project', 'End', 'Note'])
    expect(changes[0]).toEqual({ field: 'Project', from: 'Website', to: 'Mobile' })
    expect(changes[2].to).toBe('no note')
  })

  it('reports no change for equal snapshots', () => {
    expect(auditChanges(snapshot, { ...snapshot }, projectName)).toEqual([])
  })

  it('reports no change when a value is missing', () => {
    expect(auditChanges(snapshot, null, projectName)).toEqual([])
    expect(auditChanges(null, snapshot, projectName)).toEqual([])
  })
})

describe('audit snapshots', () => {
  it('round trips a time entry', () => {
    const entry = {
      id: 5,
      projectId: 1,
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      note: snapshot.note,
      createdAt: snapshot.startTime,
      updatedAt: snapshot.startTime,
    }
    expect(parseSnapshot(JSON.stringify(toSnapshot(entry)))).toEqual(snapshot)
  })

  it('ignores an unreadable snapshot', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot('not json')).toBeNull()
    expect(parseSnapshot('{"projectId":1}')).toBeNull()
  })
})
