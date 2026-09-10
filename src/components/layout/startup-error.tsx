import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type Props = {
  title: string
  /** Already redacted by the backend, so it is safe to show as it is. */
  message: string
  actionLabel: string
  onAction: () => void
  busy?: boolean
  children?: ReactNode
}

/**
 * A failure that keeps the application from running, rendered as the content of
 * the window instead of as a dialog: the user can read it, copy it and act on
 * it without a modal that has to be dismissed first.
 */
export function StartupError({ title, message, actionLabel, onAction, busy, children }: Props) {
  return (
    <main aria-live="assertive" className="boot-screen" role="alert">
      <div className="w-full max-w-xl space-y-4 rounded-lg border border-border bg-card p-6 text-left">
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="space-y-2">
            <h1 className="boot-title">{title}</h1>
            <p className="boot-text">{message}</p>
            {children}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={onAction}>
            {busy ? <Spinner size="sm" /> : null}
            {actionLabel}
          </Button>
        </div>
      </div>
    </main>
  )
}
