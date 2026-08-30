import { useQuery } from '@tanstack/react-query'
import { repository } from '@/features/storage'
import { timeEntryKeys } from '@/features/time-entries/time-entry-queries'

/** Nested under the time entry key, so every entry mutation refreshes the trail. */
export const auditKeys = { all: [...timeEntryKeys.all, 'audits'] as const }

export function useTimeEntryAudits() {
  return useQuery({ queryKey: auditKeys.all, queryFn: repository.listTimeEntryAudits })
}
