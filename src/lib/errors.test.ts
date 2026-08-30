import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError, errorMessage, isErrorKind, toAppError } from './errors'

describe('structured errors', () => {
  it('reads the serialized error of a command', () => {
    const error = toAppError({ kind: 'conflict', message: 'This project already has a budget' })

    expect(error).toBeInstanceOf(AppError)
    expect(error?.kind).toBe('conflict')
    expect(error?.message).toBe('This project already has a budget')
  })

  it('ignores failures without a known kind', () => {
    expect(toAppError({ kind: 'unknown', message: 'boom' })).toBeNull()
    expect(toAppError('boom')).toBeNull()
    expect(toAppError(new Error('boom'))).toBeNull()
  })

  it('branches on the kind instead of the message', () => {
    const notSignedIn = new AppError('notSignedIn', 'Please sign in first')

    expect(isErrorKind(notSignedIn, 'notSignedIn')).toBe(true)
    expect(isErrorKind(notSignedIn, 'validation')).toBe(false)
    expect(isErrorKind({ kind: 'rateLimited', message: 'later' }, 'rateLimited')).toBe(true)
  })

  it('shows the message of a failure the user can act on', () => {
    expect(errorMessage(new AppError('validation', 'invalid email'), 'fallback')).toBe(
      'invalid email',
    )
    expect(errorMessage({ kind: 'conflict', message: 'taken' }, 'fallback')).toBe('taken')
  })

  it('hides infrastructure details behind the fallback', () => {
    expect(errorMessage({ kind: 'database', message: 'disk I/O error' }, 'fallback')).toBe(
      'fallback',
    )
    expect(errorMessage({ kind: 'internal', message: 'password hashing failed' }, 'fallback')).toBe(
      'fallback',
    )
    expect(errorMessage(new AppError('validation', ''), 'fallback')).toBe('fallback')
  })

  it('keeps reading plain and schema failures', () => {
    const failure = z.object({ email: z.string().min(1, 'Email is required') }).safeParse({
      email: '',
    }).error

    expect(errorMessage(failure, 'fallback')).toBe('Email is required')
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
    expect(errorMessage('boom', 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
  })
})
