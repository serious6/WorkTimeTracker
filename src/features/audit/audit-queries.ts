import { useQuery } from '@tanstack/react-query'
import { repository } from '@/features/storage'

export const auditKeys = { all: ['audit-log'] as const }

/** The recorded changes of the time entries, newest first. */
export function useAuditLog() {
  return useQuery({ queryKey: auditKeys.all, queryFn: repository.listAuditLog })
}
