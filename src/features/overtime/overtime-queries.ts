import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { SaveOvertimeEntry } from './overtime-schema'

export const overtimeKeys = {
  all: ['overtime-entries'] as const,
  audits: ['overtime-audits'] as const,
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

export function useOvertimeAudits() {
  return useQuery({
    queryKey: overtimeKeys.audits,
    queryFn: () => getRepository().listOvertimeAudits(),
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
