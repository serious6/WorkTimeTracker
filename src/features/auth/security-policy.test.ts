import { describe, expect, it } from 'vitest'
import { LOGIN_LOCKOUT_MINUTES, LoginAttempts, MAX_LOGIN_ATTEMPTS } from './security-policy'

const MINUTE = 60_000

function fail(attempts: LoginAttempts, now: number, times = MAX_LOGIN_ATTEMPTS): void {
  for (let attempt = 0; attempt < times; attempt += 1) attempts.recordFailure('first@example.com', now)
}

describe('login attempts', () => {
  it('locks an email out after too many failures', () => {
    const attempts = new LoginAttempts()
    const now = Date.now()
    fail(attempts, now, MAX_LOGIN_ATTEMPTS - 1)

    expect(attempts.allows('first@example.com', now)).toBe(true)

    attempts.recordFailure('first@example.com', now)

    expect(attempts.allows('first@example.com', now)).toBe(false)
    expect(attempts.allows('second@example.com', now)).toBe(true)
  })

  it('releases the lockout after the waiting time', () => {
    const attempts = new LoginAttempts()
    const now = Date.now()
    fail(attempts, now)

    expect(attempts.allows('first@example.com', now + LOGIN_LOCKOUT_MINUTES * MINUTE - 1)).toBe(
      false,
    )
    expect(attempts.allows('first@example.com', now + LOGIN_LOCKOUT_MINUTES * MINUTE)).toBe(true)
  })

  it('forgets the failures after a successful login', () => {
    const attempts = new LoginAttempts()
    const now = Date.now()
    fail(attempts, now)
    attempts.recordSuccess('first@example.com')

    expect(attempts.allows('first@example.com', now)).toBe(true)
  })
})
