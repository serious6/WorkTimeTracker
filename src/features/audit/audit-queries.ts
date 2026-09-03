import { useQuery } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import { listAllAuditPages, type ListRange } from '@/features/storage/list-range'
import { timeEntryKeys } from '@/features/time-entries/time-entry-keys'

export const auditKeys = {
  all: ['audit-log'] as const,
  /** One cache entry per window, invalidating `all` still refreshes them all. */
  range: (range?: ListRange) => ['audit-log', range ?? null] as const,
}

/** Nested under the time entry key, so every entry mutation refreshes the trail. */
export const timeEntryAuditKeys = {
  all: [...timeEntryKeys.all, 'audits'] as const,
  range: (range?: ListRange) => [...timeEntryKeys.all, 'audits', range ?? null] as const,
}

/** The recorded changes of the time entries, newest first. */
export function useAuditLog(range?: ListRange) {
  return useQuery({
    queryKey: auditKeys.range(range),
    queryFn: () => getRepository().listAuditLog(range),
  })
}

/**
 * The recorded changes of a window, or the whole trail in bounded pages when
 * the caller names none, so the audit view never shows a truncated history.
 */
export function useTimeEntryAudits(range?: ListRange) {
  return useQuery({
    queryKey: timeEntryAuditKeys.range(range),
    queryFn: () =>
      range
        ? getRepository().listTimeEntryAudits(range)
        : listAllAuditPages((page) => getRepository().listTimeEntryAudits(page)),
  })
}
