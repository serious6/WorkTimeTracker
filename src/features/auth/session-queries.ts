import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useNavigationStore } from '@/app/navigation'
import { getRepository } from '@/features/storage'
import { useTimerStore } from '@/features/timer/timer-store'
import type { AuthUser, Credentials } from './auth-schema'

export const sessionKeys = { current: ['session'] as const }

/** The signed in user; `null` while nobody is signed in. */
export function useSession() {
  return useQuery({
    queryKey: sessionKeys.current,
    queryFn: () => getRepository().currentSession(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
}

/**
 * Switching the user drops every cached record of the previous user, so no data
 * of another account can be shown.
 */
function applySession(queryClient: QueryClient, user: AuthUser | null): void {
  useTimerStore.getState().setSession(null)
  useNavigationStore.getState().navigate('dashboard')
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionKeys.current[0],
  })
  queryClient.setQueryData(sessionKeys.current, user)
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: Credentials) => getRepository().login(credentials),
    onSuccess: (user) => applySession(queryClient, user),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: Credentials) => getRepository().register(credentials),
    onSuccess: (user) => applySession(queryClient, user),
  })
}

/** Ends the session in the user interface, for example after it expired. */
export function endSession(queryClient: QueryClient): void {
  if (queryClient.getQueryData(sessionKeys.current) === null) return
  applySession(queryClient, null)
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getRepository().logout(),
    onSuccess: () => applySession(queryClient, null),
  })
}
