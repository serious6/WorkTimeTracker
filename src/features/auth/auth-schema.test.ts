import { describe, expect, test } from 'vitest'
import {
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
  accountCreationSchema,
  credentialsSchema,
  registrationSchema,
} from './auth-schema'

describe('credentialsSchema', () => {
  test('accepts valid credentials', () => {
    const result = credentialsSchema.safeParse({ email: 'User@Example.com', password: 'secret' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com') // lowercased + trimmed
    }
  })

  test('rejects empty email', () => {
    const result = credentialsSchema.safeParse({ email: '', password: 'pw' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/required/i)
  })

  test('rejects invalid email format', () => {
    const result = credentialsSchema.safeParse({ email: 'notanemail', password: 'pw' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/valid email/i)
  })

  test('rejects empty password', () => {
    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/required/i)
  })

  test('INVALID_CREDENTIALS_MESSAGE is defined', () => {
    expect(INVALID_CREDENTIALS_MESSAGE).toBeTruthy()
  })
})

describe('registrationSchema', () => {
  test('accepts a compliant password', () => {
    const result = registrationSchema.safeParse({
      email: 'user@example.com',
      password: 'Str0ng-Passphrase!!x',
    })
    expect(result.success).toBe(true)
  })

  test('rejects a weak password with the policy message', () => {
    const result = registrationSchema.safeParse({
      email: 'user@example.com',
      password: 'weakpassword',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(PASSWORD_POLICY_MESSAGE)
  })
})

describe('accountCreationSchema', () => {
  test('accepts compliant credentials with both legal texts accepted', () => {
    const result = accountCreationSchema.safeParse({
      email: 'User@Example.com',
      password: 'Str0ng-Passphrase!!x',
      termsAccepted: true,
      privacyAccepted: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        email: 'user@example.com',
        password: 'Str0ng-Passphrase!!x',
        termsAccepted: true,
        privacyAccepted: true,
      })
    }
  })

  test('requires both legal texts to be accepted', () => {
    const result = accountCreationSchema.safeParse({
      email: 'user@example.com',
      password: 'Str0ng-Passphrase!!x',
      termsAccepted: false,
      privacyAccepted: false,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['termsAccepted', 'privacyAccepted'])
  })
})
