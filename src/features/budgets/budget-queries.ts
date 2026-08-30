import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { SaveProjectBudget } from './budget-schema'

export const budgetKeys = { all: ['project-budgets'] as const }

export function useProjectBudgets() {
  return useQuery({ queryKey: budgetKeys.all, queryFn: () => getRepository().listProjectBudgets() })
}

export function useCreateProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProjectBudget) => getRepository().createProjectBudget(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
  })
}

export function useUpdateProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveProjectBudget }) =>
      getRepository().updateProjectBudget(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
  })
}

export function useDeleteProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteProjectBudget(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
  })
}
