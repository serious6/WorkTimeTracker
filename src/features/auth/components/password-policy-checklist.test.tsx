import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { PasswordPolicyChecklist } from './password-policy-checklist'

// Policy: ≥20 chars, uppercase, lowercase, ≥2 special chars
function mkProps(pw: string) { return { password: pw } }

describe('PasswordPolicyChecklist', () => {
  test('shows all rules as unmet for empty password', () => {
    render(<PasswordPolicyChecklist {...mkProps('')} />)
    expect(screen.getByRole('list', { name: 'Password policy' })).toBeInTheDocument()
    const notMet = screen.getAllByRole('listitem').filter((el) => el.textContent?.includes('not met'))
    expect(notMet.length).toBe(4)
  })

  test('some rules satisfied for a partial password (uppercase + lowercase only)', () => {
    render(<PasswordPolicyChecklist {...mkProps('Abc')} />)
    const notMet = screen.getAllByRole('listitem').filter((el) => el.textContent?.includes('not met'))
    // length and special are not met
    expect(notMet.length).toBe(2)
  })

  test('all rules met for a compliant password', () => {
    render(<PasswordPolicyChecklist {...mkProps('Str0ng-Passphrase!!x')} />)
    const items = screen.getAllByRole('listitem')
    const notMet = items.filter((el) => el.textContent?.includes('not met'))
    expect(notMet.length).toBe(0)
  })
})
