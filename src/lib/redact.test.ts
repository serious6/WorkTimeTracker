import { describe, expect, it } from 'vitest'
import { clamp, redact } from './redact'

describe('redact', () => {
  it('keeps ordinary messages readable', () => {
    expect(redact('This time overlaps with another time entry')).toBe(
      'This time overlaps with another time entry',
    )
  })

  it('removes email addresses', () => {
    expect(redact('login failed for jane.doe@example.com twice')).toBe(
      'login failed for [redacted] twice',
    )
    expect(redact('email=jane@example.com')).toBe('email=[redacted]')
  })

  it('removes values of sensitive keys', () => {
    expect(redact('token: abc123')).toBe('token: [redacted]')
    expect(redact('Authorization=Bearer')).toBe('Authorization=[redacted]')
    expect(redact(`Authorization: ${['Bearer', 'opaque-token'].join(' ')}`)).toBe(
      'Authorization: [redacted]',
    )
    expect(redact('{"password":"top secret"}')).toBe('{"password":"[redacted]"}')
  })

  it('removes password hashes', () => {
    expect(redact('stored $argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$hash')).toBe(
      'stored [redacted]',
    )
  })

  it('keeps shell style variables', () => {
    expect(redact('reading $HOME failed')).toBe('reading $HOME failed')
  })

  it('removes file system paths', () => {
    expect(redact('unable to open /home/jane/.local/share/app.db')).toBe(
      'unable to open [redacted path]',
    )
    expect(redact('unable to open C:\\Users\\jane\\app.db')).toBe(
      'unable to open [redacted path]',
    )
  })

  it('keeps plain words that only look similar', () => {
    expect(redact('Email or password is incorrect')).toBe('Email or password is incorrect')
    expect(redact('ratio 1:2 stays')).toBe('ratio 1:2 stays')
  })
})

describe('clamp', () => {
  it('shortens long messages', () => {
    expect(clamp('a'.repeat(3_000))).toHaveLength(2_000)
  })
})
