import { useQuery } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import { timeEntryKeys } from '@/features/time-entries/time-entry-keys'

export const auditKeys = { all: ['audit-log'] as const }

/** Nested under the time entry key, so every entry mutation refreshes the trail. */
export const timeEntryAuditKeys = { all: [...timeEntryKeys.all, 'audits'] as const }

/** The recorded changes of the time entries, newest first. */
export function useAuditLog() {
  return useQuery({ queryKey: auditKeys.all, queryFn: () => getRepository().listAuditLog() })
}

export function useTimeEntryAudits() {
  return useQuery({ queryKey: timeEntryAuditKeys.all, queryFn: () => getRepository().listTimeEntryAudits() })
}
