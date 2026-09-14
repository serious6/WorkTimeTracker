import { AppLogo } from '@/components/logo'
import { useLoadingMessage } from './loading-message'

/**
 * The content of the window while the application starts or a page is still
 * loading. It replaces the blank window the user saw before and stops as soon
 * as the startup either succeeded or reported its failure.
 *
 * The wait is signalled by the turning brand mark and by the changing texts,
 * never by a busy mouse cursor, which would look like the whole system is
 * stuck. Only `message` is announced: the texts that follow are decoration and
 * would make a screen reader repeat itself every one and a half seconds.
 */
export function AppLoading({ message = 'Starting WorkTimeTracker…' }: { message?: string }) {
  const text = useLoadingMessage(message)

  return (
    <main aria-live="polite" className="boot-screen" role="status">
      <span aria-hidden="true" className="boot-logo" data-testid="loading-logo">
        <AppLogo />
      </span>
      <p aria-hidden="true" className="boot-text" data-testid="loading-message">
        {text}
      </p>
      <span className="sr-only">{message}</span>
    </main>
  )
}
