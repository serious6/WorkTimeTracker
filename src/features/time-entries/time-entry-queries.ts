import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { auditKeys } from '@/features/audit/audit-queries'
import { repository } from '@/features/storage'
import { timeEntryKeys } from './time-entry-keys'
import type { SaveTimeEntry } from './time-entry-schema'

export { timeEntryKeys }

/** Every write of a time entry also appends to the audit trail. */
async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    queryClient.invalidateQueries({ queryKey: auditKeys.all }),
  ])
}

export function useTimeEntries() {
  return useQuery({ queryKey: timeEntryKeys.all, queryFn: repository.listTimeEntries })
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveTimeEntry) => repository.createTimeEntry(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveTimeEntry }) =>
      repository.updateTimeEntry(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateTimeEntryNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string | null }) =>
      repository.updateTimeEntryNote(id, note),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useSwitchRunningTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveTimeEntry }) =>
      repository.switchRunningTimeEntry(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => repository.deleteTimeEntry(id),
    onSuccess: () => invalidate(queryClient),
  })
}
