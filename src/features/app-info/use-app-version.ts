import { useQuery } from '@tanstack/react-query'
import { repository } from '@/features/storage'

export const appVersionKeys = { all: ['app-version'] as const }

/**
 * Reads the released version stored in the local database. Returns null while
 * loading and when the version is unavailable, for example in the browser
 * fallback or after a database error.
 */
export function useAppVersion(): string | null {
  const { data } = useQuery({
    queryKey: appVersionKeys.all,
    queryFn: repository.getAppVersion,
    staleTime: Infinity,
  })
  return data ?? null
}
