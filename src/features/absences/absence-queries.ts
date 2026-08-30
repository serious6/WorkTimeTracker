import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import { listAllPages, type ListRange } from '@/features/storage/list-range'
import { absenceIndex, NO_ABSENCES, type AbsenceIndex } from './absence-index'
import type { SaveAbsence } from './absence-schema'

export const absenceKeys = {
  all: ['absences'] as const,
  /** One cache entry per window, invalidating `all` still refreshes them all. */
  range: (range?: ListRange) => ['absences', range ?? null] as const,
  audits: ['absence-audits'] as const,
}

/** Every write of an absence also appends to the audit trail. */
async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: absenceKeys.all }),
    queryClient.invalidateQueries({ queryKey: absenceKeys.audits }),
  ])
}

/**
 * The absences of a window, or the whole history in bounded pages when the
 * caller names none, so a balance that spans the account is never calculated
 * from a truncated page.
 */
export function useAbsences(range?: ListRange) {
  return useQuery({
    queryKey: absenceKeys.range(range),
    queryFn: () =>
      range
        ? getRepository().listAbsences(range)
        : listAllPages(
            (page) => getRepository().listAbsences(page),
            (absence) => absence.date,
          ),
  })
}

/** Absence type per day, ready for every target and balance calculation. */
export function useAbsenceIndex(range?: ListRange): AbsenceIndex {
  const { data } = useAbsences(range)
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
