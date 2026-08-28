import { describe, expect, it } from 'vitest'
import { isPasswordCompliant, passwordRules } from './password-policy'

function unmet(password: string): string[] {
  return passwordRules(password)
    .filter((rule) => !rule.satisfied)
    .map((rule) => rule.id)
}

describe('password policy', () => {
  it('accepts a password that satisfies every rule', () => {
    expect(unmet('Str0ng-Passphrase!!x')).toEqual([])
    expect(isPasswordCompliant('Str0ng-Passphrase!!x')).toBe(true)
  })

  it('requires at least twenty characters', () => {
    expect(unmet('Str0ng-Passphrase!!')).toEqual(['length'])
  })

  it('requires upper and lower case letters', () => {
    expect(unmet('str0ng-passphrase!!x')).toEqual(['uppercase'])
    expect(unmet('STR0NG-PASSPHRASE!!X')).toEqual(['lowercase'])
  })

  it('requires two special characters', () => {
    expect(unmet('Str0ng-Passphrasexxxx')).toEqual(['special'])
    expect(unmet('Str0ngPassphrasexxxxx')).toEqual(['special'])
  })

  it('does not count whitespace as a special character', () => {
    expect(unmet('Str0ng Passphrase xxx')).toEqual(['special'])
  })

  it('counts characters instead of code units', () => {
    expect(unmet('Straße-Passphrase!!x')).toEqual([])
  })
})
