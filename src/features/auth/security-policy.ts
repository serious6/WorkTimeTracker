/**
 * Security limits of the browser fallback. The Rust commands enforce the same
 * numbers; `contract/domain-rules.json` keeps both sides in sync.
 */
export const SESSION_TIMEOUT_MINUTES = 480
export const SESSION_MAX_LIFETIME_MINUTES = 720
export const MAX_LOGIN_ATTEMPTS = 5
export const LOGIN_LOCKOUT_MINUTES = 15

/**
 * Iterations of the PBKDF2-SHA256 fallback hash. PBKDF2 is the strongest key
 * derivation the browser offers; the count follows the OWASP recommendation for
 * PBKDF2-HMAC-SHA256 and is pinned by `contract/domain-rules.json`.
 */
export const PBKDF2_ITERATIONS = 210_000

export const LOCKED_OUT_MESSAGE = 'Too many failed sign in attempts, please try again later'

const MINUTE = 60_000

type Attempts = { failures: number; lastFailure: number }

/** Counts failed logins per email to slow down password guessing. */
export class LoginAttempts {
  private readonly attempts = new Map<string, Attempts>()

  /** Reports whether the email may try again at the given time. */
  allows(email: string, now: number = Date.now()): boolean {
    const attempt = this.attempts.get(email)
    if (!attempt) return true
    if (now - attempt.lastFailure >= LOGIN_LOCKOUT_MINUTES * MINUTE) {
      this.attempts.delete(email)
      return true
    }
    return attempt.failures < MAX_LOGIN_ATTEMPTS
  }

  recordFailure(email: string, now: number = Date.now()): void {
    const attempt = this.attempts.get(email)
    this.attempts.set(email, {
      failures: (attempt?.failures ?? 0) + 1,
      lastFailure: now,
    })
  }

  recordSuccess(email: string): void {
    this.attempts.delete(email)
  }
}
