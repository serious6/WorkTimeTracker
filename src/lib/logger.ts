import { invoke, isTauri } from '@tauri-apps/api/core'
import { clamp, redact } from './redact'

/** Turns any thrown value into a single, readable line. */
function describe(error: unknown): string {
  try {
    if (error instanceof Error) {
      const stack = error.stack ? ` ${error.stack}` : ''
      return `${error.name}: ${error.message}${stack}`
    }
    if (typeof error === 'string') return error
    return JSON.stringify(error) ?? String(error)
  } catch {
    return 'Unknown error'
  }
}

function toLine(error: unknown): string {
  return clamp(redact(describe(error)))
}

/**
 * Records a failure of the user interface. In the desktop application the line
 * lands in the log file of the backend, the browser fallback has no file system
 * and falls back to the console. Sensitive values are removed beforehand and the
 * logger never throws, so it can be called from any error handler.
 */
export async function logError(source: string, error: unknown): Promise<void> {
  const message = toLine(error)
  if (!isTauri()) {
    console.error(`[${source}] ${message}`)
    return
  }
  try {
    await invoke('log_client_error', { source, message })
  } catch {
    console.error(`[${source}] ${message}`)
  }
}

/** Fire-and-forget variant for synchronous error handlers. */
export function reportError(source: string, error: unknown): void {
  void logError(source, error)
}
