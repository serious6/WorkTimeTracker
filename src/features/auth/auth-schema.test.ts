import { describe, expect, test } from 'vitest'
import {
  INVALID_CREDENTIALS_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
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

  test('rejects emails above the length limit with the existing message', () => {
    const result = credentialsSchema.safeParse({
      email: `a@b.${'c'.repeat(251)}`,
      password: 'pw',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Too big: expected string to have <=254 characters',
    )
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
