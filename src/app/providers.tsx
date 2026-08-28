import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type PropsWithChildren } from 'react'
import { endSession } from '@/features/auth/session-queries'
import { isErrorKind } from '@/lib/errors'

/** An expired or missing session returns the application to the login page. */
function createQueryClient(): QueryClient {
  const onError = (error: unknown) => {
    if (isErrorKind(error, 'notSignedIn')) endSession(queryClient)
  }
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false },
    },
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  })
  return queryClient
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient)

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
