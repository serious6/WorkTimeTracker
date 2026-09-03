import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { securityAuditKeys } from '@/features/audit/audit-queries'
import { getRepository } from '@/features/storage'
import type { SaveProjectBudget } from './budget-schema'

export const budgetKeys = { all: ['project-budgets'] as const }

/** A budget write also appends to the audit trail, so both are refreshed. */
function invalidate(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
  void queryClient.invalidateQueries({ queryKey: securityAuditKeys.all })
}

export function useProjectBudgets() {
  return useQuery({ queryKey: budgetKeys.all, queryFn: () => getRepository().listProjectBudgets() })
}

export function useCreateProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProjectBudget) => getRepository().createProjectBudget(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveProjectBudget }) =>
      getRepository().updateProjectBudget(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteProjectBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteProjectBudget(id),
    onSuccess: () => invalidate(queryClient),
  })
}
