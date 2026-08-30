import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import { absenceIndex, NO_ABSENCES, type AbsenceIndex } from './absence-index'
import type { SaveAbsence } from './absence-schema'

export const absenceKeys = {
  all: ['absences'] as const,
  audits: ['absence-audits'] as const,
}

/** Every write of an absence also appends to the audit trail. */
async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: absenceKeys.all }),
    queryClient.invalidateQueries({ queryKey: absenceKeys.audits }),
  ])
}

export function useAbsences() {
  return useQuery({ queryKey: absenceKeys.all, queryFn: () => getRepository().listAbsences() })
}

/** Absence type per day, ready for every target and balance calculation. */
export function useAbsenceIndex(): AbsenceIndex {
  const { data } = useAbsences()
  return data ? absenceIndex(data) : NO_ABSENCES
}

export function useAbsenceAudits() {
  return useQuery({ queryKey: absenceKeys.audits, queryFn: () => getRepository().listAbsenceAudits() })
}

export function useCreateAbsence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveAbsence) => getRepository().createAbsence(input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateAbsence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveAbsence }) =>
      getRepository().updateAbsence(id, input),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useSaveAbsences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      inputs,
      replacementIds,
      updateId,
    }: {
      inputs: SaveAbsence[]
      replacementIds: number[]
      updateId?: number
    }) => getRepository().saveAbsences(inputs, replacementIds, updateId),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteAbsence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getRepository().deleteAbsence(id),
    onSuccess: () => invalidate(queryClient),
  })
}
