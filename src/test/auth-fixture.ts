import { SESSION_TIMEOUT_MINUTES } from '@/features/auth/security-policy'

export const AUTH_STORAGE_KEYS = {
  users: 'work-time-tracker.users',
  session: 'work-time-tracker.session',
  sessions: 'work-time-tracker.sessions',
} as const

// Valid PBKDF2-SHA256 hash of the shared test password with the app's test salt;
// regenerate if the password or PBKDF2_ITERATIONS changes.
export const SEEDED_AUTH_PASSWORD_HASH =
  'pbkdf2-sha256$210000$d29yay10aW1lLXRlc3QtMQ==$9WatE7lxQeDr47my/+676IM7dG0Neb4WKkD3V/MVUZw='

export function seededAuthUser(id: number, email: string, createdAt: string) {
  return { id, email, createdAt, passwordHash: SEEDED_AUTH_PASSWORD_HASH }
}

export function seededRegistrationAudit(id: number, email: string, recordedAt: string) {
  return {
    id: 1,
    entity: 'user',
    entityId: id,
    action: 'user.registered',
    actor: email,
    oldValue: null,
    newValue: JSON.stringify({ email }),
    recordedAt,
  }
}

export function seededSession(userId: number, startedAt: number) {
  const token = `test-session-${userId}`
  return {
    token,
    session: {
      userId,
      startedAt,
      expiresAt: startedAt + SESSION_TIMEOUT_MINUTES * 60_000,
    },
  }
}
