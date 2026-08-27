import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '@/features/storage'
import type { SaveTimeEntry } from './time-entry-schema'

export const timeEntryKeys = { all: ['time-entries'] as const }

export function useTimeEntries() {
  return useQuery({ queryKey: timeEntryKeys.all, queryFn: repository.listTimeEntries })
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveTimeEntry) => repository.createTimeEntry(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
  })
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveTimeEntry }) =>
      repository.updateTimeEntry(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
  })
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => repository.deleteTimeEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeEntryKeys.all }),
  })
}
