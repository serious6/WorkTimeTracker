import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { securityAuditKeys } from '@/features/audit/audit-queries'
import { getRepository } from '@/features/storage'
import type { SaveProject } from './project-schema'

export const projectKeys = { all: ['projects'] as const }

/** A project write also appends to the audit trail, so both are refreshed. */
function invalidate(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: projectKeys.all })
  void queryClient.invalidateQueries({ queryKey: securityAuditKeys.all })
}

export function useProjects() {
  return useQuery({ queryKey: projectKeys.all, queryFn: () => getRepository().listProjects() })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProject) => getRepository().createProject(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveProject }) =>
      getRepository().updateProject(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
