import { describe, expect, it } from 'vitest'
import { buildNoteUsage, getNoteSuggestions, rankNoteSuggestions } from './note-suggestions'
import type { TimeEntry } from './time-entry-schema'

function entry(id: number, note: string | null, startTime: string): TimeEntry {
  return {
    id,
    projectId: 1,
    startTime,
    endTime: startTime,
    entryType: 'work',
    note,
    createdAt: startTime,
    updatedAt: startTime,
  }
}

describe('getNoteSuggestions', () => {
  const entries = [
    entry(1, 'Daily standup', '2026-05-01T09:00:00.000Z'),
    entry(2, 'Review PR #42', '2026-05-02T09:00:00.000Z'),
    entry(3, 'Daily standup', '2026-05-03T09:00:00.000Z'),
    entry(4, 'standup follow-up', '2026-05-04T09:00:00.000Z'),
    entry(5, 'Deploy prep', '2026-05-05T09:00:00.000Z'),
    entry(6, '  ', '2026-05-06T09:00:00.000Z'),
  ]

  it('returns no suggestions when fewer than 3 characters are typed', () => {
    expect(getNoteSuggestions(entries, 'st')).toEqual([])
  })

  it('matches case-insensitively and de-duplicates notes', () => {
    expect(getNoteSuggestions(entries, 'STAND')).toEqual(['standup follow-up', 'Daily standup'])
  })

  it('narrows as the query gets more specific', () => {
    expect(getNoteSuggestions(entries, 'sta')).toEqual(['standup follow-up', 'Daily standup'])
    expect(getNoteSuggestions(entries, 'standup f')).toEqual(['standup follow-up'])
  })

  it('keeps prefix matches before substring matches and prefers recent usage', () => {
    const ranked = getNoteSuggestions(
      [
        entry(1, 'Refactor auth', '2026-05-01T09:00:00.000Z'),
        entry(2, 'auth retry fix', '2026-05-04T09:00:00.000Z'),
        entry(3, 'Auth token refresh', '2026-05-03T09:00:00.000Z'),
      ],
      'auth',
    )
    expect(ranked).toEqual(['auth retry fix', 'Auth token refresh', 'Refactor auth'])
  })

  it('ignores missing notes and unparsable timestamps', () => {
    const usage = buildNoteUsage([
      { ...entry(1, null, '2026-05-01T09:00:00.000Z') },
      { ...entry(2, 'Daily standup', 'not-a-date'), createdAt: '', updatedAt: '' },
    ])
    expect(usage).toEqual([
      { note: 'Daily standup', noteKey: 'daily standup', latestUsedAt: 0, frequency: 1 },
    ])
    expect(rankNoteSuggestions(usage, 'dai')).toEqual(['Daily standup'])
  })

  it('prefers the more frequent note when both were used at the same time', () => {
    const usage = buildNoteUsage([
      entry(1, 'Review PR', '2026-05-01T09:00:00.000Z'),
      entry(2, 'Review PR', '2026-05-01T09:00:00.000Z'),
      entry(3, 'Review notes', '2026-05-01T09:00:00.000Z'),
    ])
    expect(rankNoteSuggestions(usage, 'rev')).toEqual(['Review PR', 'Review notes'])
  })

  it('falls back to alphabetical order for equal usage', () => {
    const usage = buildNoteUsage([
      entry(1, 'Review sprint', '2026-05-01T09:00:00.000Z'),
      entry(2, 'Review notes', '2026-05-01T09:00:00.000Z'),
    ])
    expect(rankNoteSuggestions(usage, 'rev')).toEqual(['Review notes', 'Review sprint'])
  })

  it('rejects short queries against a prebuilt index', () => {
    expect(rankNoteSuggestions(buildNoteUsage(entries), 'st')).toEqual([])
  })

  it('keeps a prefix match ahead of an already ranked substring match', () => {
    const usage = buildNoteUsage([
      entry(1, 'auth retry fix', '2026-05-01T09:00:00.000Z'),
      entry(2, 'Refactor auth', '2026-05-04T09:00:00.000Z'),
    ])
    expect(rankNoteSuggestions(usage, 'auth')).toEqual(['auth retry fix', 'Refactor auth'])
  })

  it('caps the result length', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      entry(index + 1, `note ${index}`, `2026-05-${`${index + 1}`.padStart(2, '0')}T09:00:00.000Z`),
    )
    expect(getNoteSuggestions(many, 'note', 5)).toHaveLength(5)
  })
})
