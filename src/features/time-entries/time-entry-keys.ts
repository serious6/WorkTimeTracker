import type { ListRange } from '@/features/storage/list-range'

/** Query key of the time entries, kept apart so the audit queries can nest under it. */
export const timeEntryKeys = {
  all: ['time-entries'] as const,
  /** One cache entry per window, invalidating `all` still refreshes them all. */
  range: (range?: ListRange) => ['time-entries', range ?? null] as const,
}
