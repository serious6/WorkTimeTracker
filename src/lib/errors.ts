import { ZodError } from 'zod'

/** Turns unknown failures into a message that can be shown to the user. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}
