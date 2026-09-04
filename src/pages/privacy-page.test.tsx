import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { privacyPolicy } from '@/features/legal/legal-documents'
import { renderWithProviders } from '@/test/harness'
import { PrivacyPage } from './privacy-page'

describe('PrivacyPage', () => {
  test('shows the revision and every section of the shipped policy', () => {
    renderWithProviders(<PrivacyPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(
      screen.getByText(`Version ${privacyPolicy.version}, last updated ${privacyPolicy.updatedAt}.`),
    ).toBeInTheDocument()
    for (const section of privacyPolicy.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument()
    }
  })

  test('names both storage modes', () => {
    renderWithProviders(<PrivacyPage />)

    expect(screen.getByRole('heading', { level: 2, name: '2. Where your data is stored' })).toBeInTheDocument()
    expect(screen.getByText(/Local, development, self-hosted and browser builds/i)).toBeInTheDocument()
    expect(screen.getByText(/Supabase, Inc\. on infrastructure located in the European Union/)).toBeInTheDocument()
    expect(screen.getByText(/only to investigate and fix errors/i)).toBeInTheDocument()
  })

  test('names the stored data and rules out telemetry', () => {
    renderWithProviders(<PrivacyPage />)

    expect(screen.getByText(/no analytics, no telemetry/i)).toBeInTheDocument()
    expect(screen.getByText(/never the password itself/i)).toBeInTheDocument()
  })
})
