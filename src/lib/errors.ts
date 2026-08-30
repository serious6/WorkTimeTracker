import { ZodError } from 'zod'

export const APP_ERROR_KINDS = [
  'notSignedIn',
  'validation',
  'conflict',
  'notFound',
  'rateLimited',
  'database',
  'internal',
] as const

/** Mirrors the `AppError` variants returned by the Rust commands. */
export type AppErrorKind = (typeof APP_ERROR_KINDS)[number]

/**
 * Kinds whose message describes infrastructure or process internals. The
 * calling view replaces them with its own fallback text.
 */
const INFRASTRUCTURE_KINDS: readonly AppErrorKind[] = ['database', 'internal']

export class AppError extends Error {
  readonly kind: AppErrorKind

  constructor(kind: AppErrorKind, message: string) {
    super(message)
    this.name = 'AppError'
    this.kind = kind
  }
}

function isKind(value: unknown): value is AppErrorKind {
  return APP_ERROR_KINDS.includes(value as AppErrorKind)
}

/**
 * Reads the structured failure of a command. Tauri rejects with the serialized
 * `AppError`, the browser fallback throws an `AppError` directly.
 */
export function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error
  if (typeof error !== 'object' || error === null) return null
  const { kind, message } = error as { kind?: unknown; message?: unknown }
  if (!isKind(kind)) return null
  return new AppError(kind, typeof message === 'string' ? message : '')
}

export function isErrorKind(error: unknown, kind: AppErrorKind): boolean {
  return toAppError(error)?.kind === kind
}

/** Turns unknown failures into a message that can be shown to the user. */
export function errorMessage(error: unknown, fallback: string): string {
  const appError = toAppError(error)
  if (appError) {
    return INFRASTRUCTURE_KINDS.includes(appError.kind) ? fallback : appError.message || fallback
  }
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}
