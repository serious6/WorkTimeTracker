import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { absenceKeys } from '@/features/absences/absence-queries'
import { overtimeKeys } from '@/features/overtime/overtime-queries'
import { getRepository } from '@/features/storage'
import { MAX_LIST_LIMIT, type ListRange } from '@/features/storage/list-range'
import { AppError } from '@/lib/errors'
import { securityAuditKeys, timeEntryAuditKeys } from './audit-queries'
import { AUDIT_PAGE_SIZE } from './audit-trails'

/**
 * Leaves an incomplete timestamp group for the next cursor, since the storage
 * API cannot page by id. A group larger than the query cap must fail explicitly
 * rather than silently hide records.
 */
export async function readAuditPage<T extends { recordedAt: string }>(
  list: (range: ListRange) => Promise<T[]>,
  range: ListRange,
): Promise<{ rows: T[]; nextTo: string | undefined }> {
  const rows: T[] = []
  let to = range.to
  let limit = AUDIT_PAGE_SIZE + 1
  for (;;) {
    const batch = await list({ ...range, to, limit })
    const oldest = batch.at(-1)?.recordedAt
    if (batch.length < limit || oldest === undefined) {
      return { rows: [...rows, ...batch], nextTo: undefined }
    }
    const complete = batch.filter((row) => row.recordedAt > oldest)
    if (complete.length === 0) {
      if (limit === MAX_LIST_LIMIT) {
        throw new AppError('validation', 'The audit timestamp group exceeds the page limit.')
      }
      limit = Math.min(limit * 2, MAX_LIST_LIMIT)
      continue
    }
    rows.push(...complete)
    to = new Date(Date.parse(oldest) + 1).toISOString()
    if (rows.length >= AUDIT_PAGE_SIZE) return { rows, nextTo: to }
    limit = AUDIT_PAGE_SIZE + 1
  }
}

function useAuditPages<T extends { recordedAt: string }>(
  key: QueryKey,
  list: (range: ListRange) => Promise<T[]>,
  range?: ListRange,
) {
  const query = useInfiniteQuery({
    queryKey: [...key, 'pages', range ?? null],
    initialPageParam: range?.to,
    queryFn: ({ pageParam }) => readAuditPage(list, { ...range, to: pageParam }),
    getNextPageParam: (page) => page.nextTo,
  })
  return { ...query, data: query.data?.pages.flatMap((page) => page.rows) }
}

/** Separate cursors retain loaded rows on failure and keep mutation invalidation intact. */
export function useAuditTrailPages(range?: ListRange) {
  return {
    timeEntryAudits: useAuditPages(
      timeEntryAuditKeys.all,
      (page) => getRepository().listTimeEntryAudits(page),
      range,
    ),
    absenceAudits: useAuditPages(
      absenceKeys.audits,
      (page) => getRepository().listAbsenceAudits(page),
      range,
    ),
    overtimeAudits: useAuditPages(
      overtimeKeys.audits,
      (page) => getRepository().listOvertimeAudits(page),
      range,
    ),
    securityAudits: useAuditPages(
      securityAuditKeys.all,
      (page) => getRepository().listSecurityAudits(page),
      range,
    ),
  }
}
