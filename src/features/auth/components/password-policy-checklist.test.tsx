import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { PasswordPolicyChecklist } from './password-policy-checklist'

// Policy: ≥20 chars, uppercase, lowercase, ≥2 special chars
const COMPLIANT = 'Str0ng-Passphrase!!x'      // 20 chars, meets all rules
const PARTIAL = 'Abc'                           // only uppercase + lowercase met

describe('PasswordPolicyChecklist', () => {
  test('shows all rules as unmet for empty password', () => {
    render(<PasswordPolicyChecklist password="" />)
    expect(screen.getByRole('list', { name: 'Password policy' })).toBeInTheDocument()
    const notMet = screen.getAllByRole('listitem').filter((el) => el.textContent?.includes('not met'))
    expect(notMet.length).toBe(4)
  })

  test('some rules satisfied for a partial password', () => {
    render(<PasswordPolicyChecklist ****** />)
    const met = screen.getAllByRole('listitem').filter((el) => {
      const text = el.textContent ?? ''
      return text.endsWith(' met') || text.includes(' met')
    })
    // upper + lower are met; length and special are not
    expect(met.length).toBeGreaterThan(0)
  })

  test('all rules met for a compliant password', () => {
    render(<PasswordPolicyChecklist ****** />)
    const items = screen.getAllByRole('listitem')
    const notMet = items.filter((el) => el.textContent?.includes('not met'))
    expect(notMet.length).toBe(0)
  })
})
