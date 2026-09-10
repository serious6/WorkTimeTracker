import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/features/storage'
import type { StartupStatus } from './startup-schema'

export const startupKeys = { status: ['startup-status'] as const }

/**
 * Whether the backend finished its startup. The window shows a spinner while
 * this is pending and the failure of the start instead of the application when
 * it answers `failed`, so a missing database is never a blank window.
 */
export function useStartupStatus() {
  return useQuery({
    queryKey: startupKeys.status,
    queryFn: () => getRepository().startupStatus(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}

/**
 * Runs the failed part of the startup again, so a database that was started
 * after the application is picked up without a restart.
 */
export function useRetryStartup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getRepository().retryStartup(),
    onSuccess: (status: StartupStatus) => {
      queryClient.setQueryData(startupKeys.status, status)
      // A start that recovered has to read the session and the data again; the
      // queries of the failed start hold nothing but their errors. The startup
      // status itself keeps the answer of the retry.
      if (status.status === 'ready') {
        queryClient.resetQueries({
          predicate: (query) => query.queryKey[0] !== startupKeys.status[0],
        })
      }
    },
  })
}
