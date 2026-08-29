import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/logger'

type State = { failed: boolean }

/**
 * Last resort for rendering errors: it logs the exception and offers a reload
 * instead of leaving the user with a blank window.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('render', error)
    if (info.componentStack) reportError('render', new Error(info.componentStack))
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The error was reported. Reload the application to continue.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    )
  }
}
