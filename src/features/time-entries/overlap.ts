import type { SaveTimeEntry, TimeEntry } from './time-entry-schema'

const OPEN_END = Number.POSITIVE_INFINITY

function interval(entry: { startTime: string; endTime: string | null }): [number, number] {
  return [Date.parse(entry.startTime), entry.endTime ? Date.parse(entry.endTime) : OPEN_END]
}

/** A running entry is treated as open ended, so nothing may be tracked after its start. */
export function findOverlap(
  entries: TimeEntry[],
  candidate: Pick<SaveTimeEntry, 'startTime' | 'endTime'>,
  excludeId?: number,
): TimeEntry | undefined {
  const [start, end] = interval(candidate)
  return entries.find((entry) => {
    if (entry.id === excludeId) return false
    const [entryStart, entryEnd] = interval(entry)
    return entryStart < end && entryEnd > start
  })
}
