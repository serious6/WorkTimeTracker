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
 * The user whose session expired. Signing in again as that user returns to the
 * view the expiry interrupted instead of to the dashboard.
 */
let expiredUserId: number | null = null

/**
 * Switching the user drops every cached record of the previous user, so no data
 * of another account can be shown. `keepView` is only set when the same user
 * continues an interrupted session, where the view is not another account's.
 */
function applySession(
  queryClient: QueryClient,
  user: AuthUser | null,
  keepView = false,
): void {
  useTimerStore.getState().setSession(null)
  if (!keepView) useNavigationStore.getState().navigate('dashboard')
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionKeys.current[0],
  })
  queryClient.setQueryData(sessionKeys.current, user)
}

/** Signs the user in and continues where an expired session left off. */
function resumeSession(queryClient: QueryClient, user: AuthUser): void {
  const interrupted = expiredUserId === user.id
  expiredUserId = null
  applySession(queryClient, user, interrupted)
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: Credentials) => getRepository().login(credentials),
    onSuccess: (user) => resumeSession(queryClient, user),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: Credentials) => getRepository().register(credentials),
    onSuccess: (user) => resumeSession(queryClient, user),
  })
}

/** Ends the session in the user interface, for example after it expired. */
export function endSession(queryClient: QueryClient): void {
  const user = queryClient.getQueryData<AuthUser | null>(sessionKeys.current)
  if (user === null) return
  expiredUserId = user?.id ?? null
  // The view survives the expiry, so signing in again costs no context.
  applySession(queryClient, null, true)
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getRepository().logout(),
    onSuccess: () => {
      expiredUserId = null
      applySession(queryClient, null)
    },
  })
}
