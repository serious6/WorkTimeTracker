import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { termsOfService } from '@/features/legal/legal-documents'
import { renderWithProviders } from '@/test/harness'
import { TermsPage } from './terms-page'

describe('TermsPage', () => {
  test('shows the revision and every section of the shipped terms', () => {
    renderWithProviders(<TermsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(
      screen.getByText(
        `Version ${termsOfService.version}, last updated ${termsOfService.updatedAt}.`,
      ),
    ).toBeInTheDocument()
    for (const section of termsOfService.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument()
    }
  })

  test('names the hosted database and rules out an availability commitment', () => {
    renderWithProviders(<TermsPage />)

    expect(screen.getByRole('heading', { level: 2, name: '7. No availability commitment' })).toBeInTheDocument()
    expect(screen.getByText(/no uptime or availability commitment/i)).toBeInTheDocument()
    expect(screen.getByText(/hosted database in the European Union described in the privacy policy/i)).toBeInTheDocument()
  })

  test('states that the working time checks are no legal advice', () => {
    renderWithProviders(<TermsPage />)

    expect(screen.getByText(/They are not legal advice, not a certified time recording system/i)).toBeInTheDocument()
    expect(screen.getByText(/without warranty of any kind/i)).toBeInTheDocument()
  })
})
