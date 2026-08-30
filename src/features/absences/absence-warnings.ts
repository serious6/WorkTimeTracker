import { isBreak } from '@/features/time-entries/time-entry-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
import { addDays, fromDateKey } from '@/lib/date'
import type { AbsenceIndex } from './absence-index'
import { ABSENCE_TYPE_LABELS, type AbsenceType } from './absence-schema'

export type AbsenceWarning = {
  dateKey: string
  type: AbsenceType
  message: string
}

/**
 * Recording time on an absence day is allowed: the entry counts fully as worked
 * time and only earns a warning, because the day carries no target.
 */
export function absenceWorkWarnings(
  entries: TimeEntry[],
  absences: AbsenceIndex,
  now: number,
): AbsenceWarning[] {
  if (absences.size === 0) return []
  return [...absences.keys()]
    .filter((dateKey) => {
      const start = fromDateKey(dateKey).getTime()
      const end = addDays(fromDateKey(dateKey), 1).getTime()
      return entries.some((entry) => !isBreak(entry) && Date.parse(entry.startTime) < end && (entry.endTime ? Date.parse(entry.endTime) : now) > start)
    })
    .sort()
    .map((dateKey) => {
      const type = absences.get(dateKey) as AbsenceType
      return {
        dateKey,
        type,
        message: `Time was recorded although the day is marked as ${ABSENCE_TYPE_LABELS[
          type
        ].toLowerCase()}. The time counts fully, ${
          type === 'halfDay' ? 'half the target still applies.' : 'the day carries no target.'
        }`,
      }
    })
}
