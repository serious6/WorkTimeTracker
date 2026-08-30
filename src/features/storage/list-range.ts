import { AppError } from '@/lib/errors'

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

const INVALID_RANGE = 'invalid list range'

/** Rows a list query returns when the caller names no limit. */
export const DEFAULT_LIST_LIMIT = 1000
/** Hard ceiling of a list query, a larger limit is capped to it. */
export const MAX_LIST_LIMIT = 5000
/** Rows the combined audit log returns, it only feeds the recent-changes card. */
export const AUDIT_LOG_LIMIT = 200

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** The value as an instant, `null` when it names no point in time at all. */
function instant(value: string): string | null {
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/**
 * A bound is a whole ISO date or a whole ISO timestamp; a value that only
 * starts with one is rejected, because bounds are compared against stored
 * timestamps as text.
 */
function checkedBound(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const bound = value.trim()
  if (bound === '') return undefined
  const whole = DATE.test(bound)
    ? instant(`${bound}T00:00:00.000Z`) === `${bound}T00:00:00.000Z`
    : TIMESTAMP.test(bound) && instant(bound) === bound
  if (!whole) throw new AppError('validation', INVALID_RANGE)
  return bound
}

/**
 * Rejects a window the native backend would reject too, so both repositories
 * implement one contract: `ListRange::validate` in `src-tauri/src/models.rs`.
 * The answer is the normalized window, with blank bounds dropped.
 */
export function validateListRange(range: ListRange | undefined): ListRange | undefined {
  if (!range) return undefined
  const from = checkedBound(range.from)
  const to = checkedBound(range.to)
  if (from !== undefined && to !== undefined && from > to) {
    throw new AppError('validation', INVALID_RANGE)
  }
  const { limit } = range
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new AppError('validation', INVALID_RANGE)
  }
  return { from, to, limit }
}

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

/**
 * Reads a complete ascending history in bounded pages instead of a single
 * truncated page. Each call asks for the newest {@link MAX_LIST_LIMIT} rows
 * before the oldest row already read, so the backend answers a bounded query
 * while a view that spans the whole account (a cumulative balance, a budget
 * report) still sees every row. `bound` names the exclusive upper bound of a
 * row; it has to be unique per row, which holds for the start of a time entry
 * (entries may not overlap) and for the date of an absence (one per day).
 */
export async function listAllPages<T>(
  page: (range: ListRange) => Promise<T[]>,
  bound: (row: T) => string,
): Promise<T[]> {
  const pages: T[][] = []
  let to: string | undefined
  for (;;) {
    const rows = await page({ to, limit: MAX_LIST_LIMIT })
    pages.unshift(rows)
    const oldest = rows.length > 0 ? bound(rows[0]) : undefined
    // A short page is the last one, and a page that does not move the bound
    // backwards would repeat itself.
    if (rows.length < MAX_LIST_LIMIT || oldest === undefined || (to !== undefined && oldest >= to)) {
      return pages.flat()
    }
    to = oldest
  }
}
