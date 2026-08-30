import { workingDays } from '@/features/compliance/compliance-rules'
import type { ComplianceLimits } from '@/features/settings/work-settings-schema'
import type { TimeEntry } from '@/features/time-entries/time-entry-schema'
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
  limits: ComplianceLimits,
  now: number,
): AbsenceWarning[] {
  if (absences.size === 0) return []
  return workingDays(entries, limits, now)
    .filter((day) => absences.has(day.dateKey))
    .map((day) => {
      const type = absences.get(day.dateKey) as AbsenceType
      return {
        dateKey: day.dateKey,
        type,
        message: `Time was recorded although the day is marked as ${ABSENCE_TYPE_LABELS[
          type
        ].toLowerCase()}. The time counts fully, the day carries no target.`,
      }
    })
}
