import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { SaveNoteTemplate } from './note-template-schema'

export const noteTemplateKeys = { all: ['note-templates'] as const }

/**
 * Only the templates are refreshed: a template write never touches a record,
 * so the notes stored on time entries and overtime records stay as they are.
 */
function invalidate(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: noteTemplateKeys.all })
}

export function useNoteTemplates() {
  return useQuery({
    queryKey: noteTemplateKeys.all,
    queryFn: () => getRepository().listNoteTemplates(),
  })
}

export function useCreateNoteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveNoteTemplate) => getRepository().createNoteTemplate(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateNoteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveNoteTemplate }) =>
      getRepository().updateNoteTemplate(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteNoteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteNoteTemplate(id),
    onSuccess: () => invalidate(queryClient),
  })
}
