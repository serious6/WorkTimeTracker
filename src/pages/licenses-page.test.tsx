import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import licenseData from '@/data/licenses.json'
import { renderWithProviders } from '@/test/harness'
import { LicensesPage } from './licenses-page'

describe('LicensesPage', () => {
  test('shows release metadata and complete package notices', () => {
    renderWithProviders(<LicensesPage />)

    expect(screen.getByRole('heading', { name: 'Third-Party Licenses' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Dependencies for version ${licenseData.appVersion}`))).toBeInTheDocument()
    expect(screen.getByText(`${licenseData.npm[0].name} ${licenseData.npm[0].version}`)).toBeInTheDocument()
  })
})
