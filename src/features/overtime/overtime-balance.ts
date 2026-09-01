import type { OvertimeEntry } from './overtime-schema'

export type ExplicitOvertime = {
  /**
   * First day whose automatically derived overtime still counts, `null` while
   * no `opening` or `balance` record was set. Everything before it is replaced
   * by the record.
   */
  startKey: string | null
  /** Sum of the explicit records that count towards the balance. */
  minutes: number
}

const NO_EXPLICIT_OVERTIME: ExplicitOvertime = { startKey: null, minutes: 0 }

/**
 * Folds the explicit overtime records into the value they contribute up to and
 * including `throughKey`. An `opening` or `balance` record is absolute: the
 * newest one replaces everything before its effective date, `adjustment`
 * records after it are added on top. Records with a later effective date do not
 * count yet, so a future correction cannot change today's balance.
 */
export function explicitOvertime(
  entries: OvertimeEntry[],
  throughKey: string,
): ExplicitOvertime {
  const counted = entries.filter((entry) => entry.effectiveDate <= throughKey)
  if (counted.length === 0) return NO_EXPLICIT_OVERTIME

  const anchor = counted
    .filter((entry) => entry.kind !== 'adjustment')
    .reduce<OvertimeEntry | null>(
      (newest, entry) =>
        newest === null || entry.effectiveDate > newest.effectiveDate ? entry : newest,
      null,
    )
  const adjustments = counted.filter(
    (entry) =>
      entry.kind === 'adjustment' &&
      (anchor === null || entry.effectiveDate >= anchor.effectiveDate),
  )

  return {
    startKey: anchor?.effectiveDate ?? null,
    minutes:
      (anchor?.minutes ?? 0) +
      adjustments.reduce((total, entry) => total + entry.minutes, 0),
  }
}
