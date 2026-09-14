import type { TimeEntry } from './time-entry-schema'

const MIN_QUERY_LENGTH = 3
const DEFAULT_LIMIT = 6

type NoteSuggestion = {
  note: string
  noteKey: string
  latestUsedAt: number
  frequency: number
}

function usageTime(entry: TimeEntry): number {
  const updated = Date.parse(entry.updatedAt)
  if (Number.isFinite(updated)) return updated
  const start = Date.parse(entry.startTime)
  return Number.isFinite(start) ? start : 0
}

export function getNoteSuggestions(
  entries: TimeEntry[],
  query: string,
  limit = DEFAULT_LIMIT,
): string[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < MIN_QUERY_LENGTH) return []

  const notes = new Map<string, NoteSuggestion>()
  for (const entry of entries) {
    const note = entry.note?.trim()
    if (!note) continue
    const noteKey = note.toLowerCase()
    const previous = notes.get(noteKey)
    const usedAt = usageTime(entry)
    if (!previous) {
      notes.set(noteKey, { note, noteKey, latestUsedAt: usedAt, frequency: 1 })
      continue
    }
    notes.set(noteKey, {
      note: previous.latestUsedAt >= usedAt ? previous.note : note,
      noteKey,
      latestUsedAt: Math.max(previous.latestUsedAt, usedAt),
      frequency: previous.frequency + 1,
    })
  }

  return [...notes.values()]
    .filter((candidate) => candidate.noteKey.includes(needle))
    .sort((a, b) => {
      const aPrefix = a.noteKey.startsWith(needle) ? 0 : 1
      const bPrefix = b.noteKey.startsWith(needle) ? 0 : 1
      if (aPrefix !== bPrefix) return aPrefix - bPrefix
      if (a.latestUsedAt !== b.latestUsedAt) return b.latestUsedAt - a.latestUsedAt
      if (a.frequency !== b.frequency) return b.frequency - a.frequency
      return a.note.localeCompare(b.note)
    })
    .slice(0, limit)
    .map((candidate) => candidate.note)
}
