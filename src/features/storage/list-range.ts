/**
 * Window of a list query: `from` is inclusive, `to` is exclusive, both an ISO
 * date or timestamp. A query without a window still answers at most
 * {@link DEFAULT_LIST_LIMIT} rows, so its cost never grows with the age of the
 * account. `contract/domain-rules.json` pins the three numbers for both
 * backends, `ListRange` in `src-tauri/src/models.rs` is the native half.
 */
export type ListRange = {
  from?: string
  to?: string
  limit?: number
}

/** Rows a list query returns when the caller names no limit. */
export const DEFAULT_LIST_LIMIT = 1000
/** Hard ceiling of a list query, a larger limit is capped to it. */
export const MAX_LIST_LIMIT = 5000
/** Rows the combined audit log returns, it only feeds the recent-changes card. */
export const AUDIT_LOG_LIMIT = 200

/** The bounded number of rows of a range, never above {@link MAX_LIST_LIMIT}. */
export function listLimit(range: ListRange | undefined, fallback = DEFAULT_LIST_LIMIT): number {
  return Math.min(range?.limit ?? fallback, MAX_LIST_LIMIT)
}

/** Keeps the rows that overlap the window, `end` `null` means still running. */
export function filterListRange<T>(
  rows: T[],
  range: ListRange | undefined,
  bounds: (row: T) => { start: string; end: string | null },
): T[] {
  return rows.filter((row) => {
    const { start, end } = bounds(row)
    if (range?.to && start >= range.to) return false
    if (range?.from && end !== null && end <= range.from) return false
    return true
  })
}

/** Keeps the rows whose single date lies in the window, like an absence. */
export function filterPointRange<T>(
  rows: T[],
  range: ListRange | undefined,
  date: (row: T) => string,
): T[] {
  return rows.filter((row) => {
    const at = date(row)
    if (range?.from && at < range.from) return false
    if (range?.to && at >= range.to) return false
    return true
  })
}

/** Cuts an ascending list down to its newest rows, the tail of the list. */
export function limitAscending<T>(rows: T[], limit: number): T[] {
  return rows.length > limit ? rows.slice(rows.length - limit) : rows
}

/** Cuts a descending list down to its newest rows, the head of the list. */
export function limitDescending<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit)
}
