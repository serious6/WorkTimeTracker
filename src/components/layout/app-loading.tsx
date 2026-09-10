import { Spinner } from '@/components/ui/spinner'

/**
 * The content of the window while the application starts or a page is still
 * loading. It replaces the blank window the user saw before and stops as soon
 * as the startup either succeeded or reported its failure.
 */
export function AppLoading({ message = 'Starting WorkTimeTracker…' }: { message?: string }) {
  return (
    <main aria-live="polite" className="boot-screen" role="status">
      <Spinner />
      <p className="boot-text">{message}</p>
    </main>
  )
}
