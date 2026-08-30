import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { reconcileSession } from './recover-session'

function running(projectId: number | null): TimeEntry {
  return {
    id: 1,
    projectId,
    startTime: '2026-08-27T08:00:00.000Z',
    endTime: null,
    entryType: 'work',
    note: null,
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z',
  }
}

describe('reconcileSession', () => {
  it('adopts a running entry when the session was lost', () => {
    expect(reconcileSession(null, running(7))).toEqual({
      projectId: 7,
      carriedMs: 0,
      paused: false,
    })
  })

  it('keeps the carried time of the matching session', () => {
    const session = { projectId: 7, carriedMs: 60_000, paused: false }
    expect(reconcileSession(session, running(7))).toBe(session)
  })

  it('resumes a paused session when its entry is still running', () => {
    expect(reconcileSession({ projectId: 7, carriedMs: 60_000, paused: true }, running(7))).toEqual({
      projectId: 7,
      carriedMs: 60_000,
      paused: false,
    })
  })

  it('drops carried time that belongs to another project', () => {
    expect(reconcileSession({ projectId: 3, carriedMs: 60_000, paused: false }, running(7))).toEqual(
      { projectId: 7, carriedMs: 0, paused: false },
    )
  })

  it('clears a running session without a running entry', () => {
    expect(reconcileSession({ projectId: 7, carriedMs: 60_000, paused: false }, undefined)).toBeNull()
  })

  it('keeps a paused session without a running entry', () => {
    const session = { projectId: 7, carriedMs: 60_000, paused: true }
    expect(reconcileSession(session, undefined)).toBe(session)
  })

  it('keeps no session when nothing is stored', () => {
    expect(reconcileSession(null, undefined)).toBeNull()
  })
})
