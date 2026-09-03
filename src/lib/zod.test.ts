import { describe, expect, it } from 'vitest'
import { z } from './zod'

describe('zod configuration', () => {
  it('disables the JIT compilation, so no schema probes for `eval`', () => {
    expect(z.config().jitless).toBe(true)
  })

  it('still parses and rejects with the interpreted path', () => {
    const schema = z.object({ name: z.string() })

    expect(schema.parse({ name: 'Website' })).toEqual({ name: 'Website' })
    expect(schema.safeParse({ name: 1 }).success).toBe(false)
  })
})
