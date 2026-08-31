import { describe, expect, it } from 'vitest'
import { isPlausibleEmail } from './email'

describe('isPlausibleEmail', () => {
  it('accepts plausible emails', () => {
    expect(isPlausibleEmail('user@example.com')).toBe(true)
    expect(isPlausibleEmail('first.last@example.co.uk')).toBe(true)
    expect(isPlausibleEmail('a@b.c')).toBe(true)
    expect(isPlausibleEmail('first+tag@例.example')).toBe(true)
  })

  it.each([
    '',
    'user.example.com',
    '@example.com',
    'user@',
    'user@example',
    'user@@example.com',
    'user@example@com',
  ])('rejects malformed address %j', (email) => {
    expect(isPlausibleEmail(email)).toBe(false)
  })

  it.each([
    'user@example..com',
    'user@.example.com',
    'user@example.com.',
    'user@..',
  ])('rejects empty domain labels in %j', (email) => {
    expect(isPlausibleEmail(email)).toBe(false)
  })

  it.each([
    ' user@example.com',
    'user@example.com ',
    'user\tname@example.com',
    'user@example\n.com',
    'user@example.com\n',
    'user\u0085name@example.com',
    'user\u00a0name@example.com',
    'user@example\u2028.com',
  ])('rejects ASCII and Unicode whitespace in %j', (email) => {
    expect(isPlausibleEmail(email)).toBe(false)
  })

  it('enforces the max length boundary', () => {
    const atLimit = `a@b.${'c'.repeat(250)}`
    const overLimit = `a@b.${'c'.repeat(251)}`

    expect(atLimit).toHaveLength(254)
    expect(isPlausibleEmail(atLimit)).toBe(true)
    expect(overLimit).toHaveLength(255)
    expect(isPlausibleEmail(overLimit)).toBe(false)
  })

  it('measures the max length in UTF-8 bytes', () => {
    expect(isPlausibleEmail(`${'é'.repeat(124)}a@x.io`)).toBe(true)
    expect(isPlausibleEmail(`${'é'.repeat(125)}@x.io`)).toBe(false)
    expect(isPlausibleEmail(`${'😀'.repeat(62)}a@x.io`)).toBe(true)
    expect(isPlausibleEmail(`${'😀'.repeat(62)}ab@x.io`)).toBe(false)
  })
})
