import type { Absence, AbsenceType } from './absence-schema'

/** Absence type per local calendar day, at most one per day. */
export type AbsenceIndex = ReadonlyMap<string, AbsenceType>

export const NO_ABSENCES: AbsenceIndex = new Map()

export function absenceIndex(absences: readonly Absence[]): AbsenceIndex {
  return new Map(absences.map((absence) => [absence.date, absence.type] as const))
}

export function absenceOn(absences: AbsenceIndex, dateKey: string): AbsenceType | null {
  return absences.get(dateKey) ?? null
}
