import { z } from '@/lib/zod'

/**
 * Outcome of the backend startup. `failed` carries the already redacted text of
 * the backend, so the window can show why the application could not start.
 */
export const startupStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready') }),
  z.object({ status: z.literal('failed'), message: z.string() }),
])

export type StartupStatus = z.output<typeof startupStatusSchema>
