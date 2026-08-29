import { reportError } from './logger'

type Listeners = {
  target: Window
  onError: (event: ErrorEvent) => void
  onRejection: (event: PromiseRejectionEvent) => void
}

let listeners: Listeners | null = null

/**
 * Sends exceptions and rejected promises that no component handled to the log.
 * Registering twice would log every failure twice, so the call is idempotent.
 */
export function listenForUnhandledErrors(target: Window = window): void {
  if (listeners) return

  const onError = (event: ErrorEvent) => reportError('window', event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => reportError('promise', event.reason)
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  listeners = { target, onError, onRejection }
}

/** Detaches the handlers again, used by the tests. */
export function stopListeningForUnhandledErrors(): void {
  if (!listeners) return

  listeners.target.removeEventListener('error', listeners.onError)
  listeners.target.removeEventListener('unhandledrejection', listeners.onRejection)
  listeners = null
}
