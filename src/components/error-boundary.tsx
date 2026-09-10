import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import { StartupError } from '@/components/layout/startup-error'
import { reportError } from '@/lib/logger'

type State = { failed: boolean }

/**
 * Last resort for rendering errors: it logs the exception and offers a reload
 * instead of leaving the user with a blank window. It uses the same panel as a
 * failed startup, so every unrecoverable failure looks alike.
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
      <StartupError
        actionLabel="Reload"
        message="The error was reported. Reload the application to continue."
        onAction={() => window.location.reload()}
        title="Something went wrong"
      />
    )
  }
}
