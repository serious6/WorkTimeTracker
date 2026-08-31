import { describe, expect, it } from 'vitest'
import { isPlausibleEmail } from './email'

describe('isPlausibleEmail', () => {
  it('accepts plausible emails', () => {
    expect(isPlausibleEmail('user@example.com')).toBe(true)
    expect(isPlausibleEmail('first.last@example.co.uk')).toBe(true)
  })

  it('rejects missing at signs', () => {
    expect(isPlausibleEmail('user.example.com')).toBe(false)
  })

  it('rejects empty local parts', () => {
    expect(isPlausibleEmail('@example.com')).toBe(false)
  })

  it('rejects empty domain labels', () => {
    expect(isPlausibleEmail('user@example..com')).toBe(false)
    expect(isPlausibleEmail('user@.example.com')).toBe(false)
    expect(isPlausibleEmail('user@example.com.')).toBe(false)
  })

  it('rejects whitespace', () => {
    expect(isPlausibleEmail('user name@example.com')).toBe(false)
    expect(isPlausibleEmail('user@example .com')).toBe(false)
  })

  it('enforces the max length boundary', () => {
    const atLimit = `a@b.${'c'.repeat(250)}`
    const overLimit = `a@b.${'c'.repeat(251)}`

    expect(atLimit).toHaveLength(254)
    expect(isPlausibleEmail(atLimit)).toBe(true)
    expect(overLimit).toHaveLength(255)
    expect(isPlausibleEmail(overLimit)).toBe(false)
  })
})
