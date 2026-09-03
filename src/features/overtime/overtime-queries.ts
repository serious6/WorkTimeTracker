import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import { listAllAuditPages, type ListRange } from '@/features/storage/list-range'
import type { SaveOvertimeEntry } from './overtime-schema'

export const overtimeKeys = {
  all: ['overtime-entries'] as const,
  audits: ['overtime-audits'] as const,
  /** One cache entry per audit window, invalidating `audits` refreshes them all. */
  auditRange: (range?: ListRange) => ['overtime-audits', range ?? null] as const,
}

/** Every write of an overtime record also appends to the audit trail. */
async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: overtimeKeys.all }),
    queryClient.invalidateQueries({ queryKey: overtimeKeys.audits }),
  ])
}

/** The explicit overtime records of the signed-in user, newest date first. */
export function useOvertimeEntries() {
  return useQuery({
    queryKey: overtimeKeys.all,
    queryFn: () => getRepository().listOvertimeEntries(),
  })
}

/** The recorded changes of a window, or the whole trail in bounded pages. */
export function useOvertimeAudits(range?: ListRange) {
  return useQuery({
    queryKey: overtimeKeys.auditRange(range),
    queryFn: () =>
      range
        ? getRepository().listOvertimeAudits(range)
        : listAllAuditPages((page) => getRepository().listOvertimeAudits(page)),
  })
}

export function useCreateOvertimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveOvertimeEntry) => getRepository().createOvertimeEntry(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateOvertimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveOvertimeEntry }) =>
      getRepository().updateOvertimeEntry(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteOvertimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteOvertimeEntry(id),
    onSuccess: () => invalidate(queryClient),
  })
}
