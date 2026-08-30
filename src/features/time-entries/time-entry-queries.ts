import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { auditKeys } from '@/features/audit/audit-queries'
import { getRepository } from '@/features/storage'
import { timeEntryKeys } from './time-entry-keys'
import type { ListRange } from '@/features/storage/list-range'
import type { SaveTimeEntry } from './time-entry-schema'

export { timeEntryKeys }

/** Every write of a time entry also appends to the audit trail. */
async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
    queryClient.invalidateQueries({ queryKey: auditKeys.all }),
  ])
}

/**
 * The tracked entries, by default the bounded newest ones. A view that only
 * renders a period passes it as `range`, so the query costs what the view shows
 * instead of the whole account history.
 */
export function useTimeEntries(range?: ListRange) {
  return useQuery({
    queryKey: timeEntryKeys.range(range),
    queryFn: () => getRepository().listTimeEntries(range),
  })
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveTimeEntry) => getRepository().createTimeEntry(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveTimeEntry }) =>
      getRepository().updateTimeEntry(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateTimeEntryNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string | null }) =>
      getRepository().updateTimeEntryNote(id, note),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useSwitchRunningTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveTimeEntry }) =>
      getRepository().switchRunningTimeEntry(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteTimeEntry(id),
    onSuccess: () => invalidate(queryClient),
  })
}
