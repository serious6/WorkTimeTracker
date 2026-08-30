import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { SaveProject } from './project-schema'

export const projectKeys = { all: ['projects'] as const }

export function useProjects() {
  return useQuery({ queryKey: projectKeys.all, queryFn: () => getRepository().listProjects() })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProject) => getRepository().createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveProject }) =>
      getRepository().updateProject(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
