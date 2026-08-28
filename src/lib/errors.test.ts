import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorMessage } from './errors'

const schema = z.object({ email: z.string().email('Enter a valid email address') })

describe('errorMessage', () => {
  it('reports the first issue of a failed validation', () => {
    const error = schema.safeParse({ email: 'invalid' }).error

    expect(errorMessage(error, 'fallback')).toBe('Enter a valid email address')
  })

  it('passes the message of a regular error through', () => {
    expect(errorMessage(new Error('database unavailable'), 'fallback')).toBe('database unavailable')
  })

  it('falls back for errors without a message', () => {
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
  })

  it('falls back for values that are no errors', () => {
    expect(errorMessage('boom', 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
