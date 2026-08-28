import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { localRepository } from '@/features/storage/local-repository'
import { renderWithProviders, resetAppState, signIn } from '@/test/harness'
import { SettingsPage } from './settings-page'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

describe('SettingsPage', () => {
  test('renders the settings heading', async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  test('loads and shows the work schedule form', async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('Work schedule')).toBeInTheDocument()
    expect(screen.getByLabelText(/weekly working time/i)).toBeInTheDocument()
  })

  test('shows all weekday checkboxes', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Saturday' })).toBeInTheDocument()
  })

  test('shows week starts on selector', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')
    expect(screen.getByRole('combobox', { name: /week starts on/i })).toBeInTheDocument()
  })

  test('saves settings successfully', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')
    fireEvent.change(screen.getByLabelText(/weekly working time/i), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(async () => {
      expect((await localRepository.getWorkSettings()).weeklyTargetMinutes).toBe(2_100)
    })
  })

  test('shows error when all working days are unchecked', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
      const checkbox = screen.getByRole('checkbox', { name: day }) as HTMLInputElement
      if (checkbox.checked) fireEvent.click(checkbox)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/at least one working day/i)).toBeInTheDocument()
  })

  test('shows error for invalid weekly target (0 hours)', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')

    const input = screen.getByLabelText(/weekly working time/i)
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText(/1 minute and 168 hours/i)).toBeInTheDocument()
  })

  test('shows local data section', async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('Local data')).toBeInTheDocument()
  })
})
