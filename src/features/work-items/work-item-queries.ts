import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { SaveWorkItem } from './work-item-schema'

export const workItemKeys = { all: ['work-items'] as const }

export function useWorkItems() {
  return useQuery({ queryKey: workItemKeys.all, queryFn: () => getRepository().listWorkItems() })
}

export function useCreateWorkItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveWorkItem) => getRepository().createWorkItem(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.all }),
  })
}

export function useUpdateWorkItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveWorkItem }) =>
      getRepository().updateWorkItem(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.all }),
  })
}

export function useDeleteWorkItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteWorkItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workItemKeys.all }),
  })
}
