import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useToastStore } from '@/components/ui/toast-store'
import {
  BREAK_ORDER_MESSAGE,
  GERMAN_COMPLIANCE_LIMITS,
} from '@/features/settings/work-settings-schema'
import { setRepository } from '@/features/storage'
import { createLocalRepository } from '@/features/storage/local-repository'
import { createTestQueryClient, renderWithProviders, resetAppState, seedProject, signIn } from '@/test/harness'
import { SettingsPage } from './settings-page'

const EMAIL = 'tester@example.com'

beforeEach(async () => {
  await resetAppState()
  await signIn(EMAIL)
  await seedProject('Erasure')
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
      expect((await createLocalRepository().getWorkSettings()).weeklyTargetMinutes).toBe(2_100)
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
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(/at least one working day/i)
    expect(screen.getByRole('group', { name: 'Working days' })).toHaveAttribute(
      'aria-describedby',
      error.id,
    )
  })

  test('shows error for invalid weekly target (0 hours)', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Work schedule')

    const input = screen.getByLabelText(/weekly working time/i)
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(/1 minute and 168 hours/i)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
  })

  test('shows local data section', async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('Local data')).toBeInTheDocument()
  })

  test('saves adjusted working time limits', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Working time limits')
    fireEvent.change(screen.getByLabelText(/maximum daily working time/i), {
      target: { value: '480' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(async () => {
      expect(
        (await createLocalRepository().getWorkSettings()).complianceLimits.maxDailyWorkMinutes,
      ).toBe(480)
    })
  })

  test('restores the German defaults', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Working time limits')
    const restore = screen.getByRole('button', { name: /restore german defaults/i })
    expect(restore).toBeDisabled()

    const field = screen.getByLabelText(/minimum rest between working days/i)
    fireEvent.change(field, { target: { value: '600' } })
    expect(restore).toBeEnabled()
    fireEvent.click(restore)

    expect((field as HTMLInputElement).value).toBe(
      `${GERMAN_COMPLIANCE_LIMITS.minRestMinutes}`,
    )
  })

  test('rejects a longer break that is shorter than the short break', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Working time limits')
    fireEvent.change(screen.getByLabelText(/required longer break/i), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(BREAK_ORDER_MESSAGE)
    expect(error.parentElement).toHaveAttribute('aria-describedby', error.id)
  })

  test('links an invalid working time limit to its field', async () => {
    renderWithProviders(<SettingsPage />)
    await screen.findByText('Working time limits')
    const input = screen.getByLabelText(/minimum rest between working days/i)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    const error = await screen.findByRole('alert')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
  })
})

describe('SettingsPage – danger zone', () => {
  /** Counts the calls of the erasure without changing its behaviour. */
  const deleteAccount = vi.fn(() => createLocalRepository().deleteAccount())

  beforeEach(() => {
    deleteAccount.mockClear()
    setRepository({ ...createLocalRepository(), deleteAccount })
  })

  afterEach(() => {
    setRepository(null)
  })

  /** Opens the deletion dialog of the signed-in account. */
  async function openDeleteDialog(queryClient?: QueryClient) {
    const rendered = queryClient
      ? renderWithProviders(<SettingsPage />, queryClient)
      : renderWithProviders(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    return { ...rendered, dialog: await screen.findByRole('dialog') }
  }

  function confirmButton() {
    return within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' })
  }

  function typeConfirmation(value: string) {
    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), { target: { value } })
  }

  test('separates the deletion into a danger zone', async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('Danger zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  })

  test('keeps the confirmation disabled until the exact email is typed', async () => {
    await openDeleteDialog()
    expect(confirmButton()).toBeDisabled()

    typeConfirmation('tester')
    expect(confirmButton()).toBeDisabled()

    typeConfirmation('other@example.com')
    expect(confirmButton()).toBeDisabled()

    typeConfirmation('  TESTER@Example.com  ')
    expect(confirmButton()).toBeEnabled()
  })

  /** The account survives everything that is not the confirmed deletion. */
  async function expectNothingDeleted() {
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(await createLocalRepository().currentSession()).not.toBeNull()
    expect(await createLocalRepository().listProjects()).toHaveLength(1)
  }

  test('deletes nothing when the dialog is cancelled', async () => {
    await openDeleteDialog()
    typeConfirmation(EMAIL)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    await expectNothingDeleted()
  })

  test('deletes nothing when escape closes the dialog', async () => {
    await openDeleteDialog()
    typeConfirmation(EMAIL)

    fireEvent.keyDown(document, { key: 'Escape' })

    await expectNothingDeleted()
  })

  test('deletes nothing when the dialog is closed', async () => {
    await openDeleteDialog()
    typeConfirmation(EMAIL)

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    await expectNothingDeleted()
  })

  test('forgets the typed confirmation when the dialog is reopened', async () => {
    await openDeleteDialog()
    typeConfirmation(EMAIL)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openDeleteDialog()

    expect(confirmButton()).toBeDisabled()
  })

  test('erases the account, ends the session and clears the cache', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['projects'], [{ id: 1 }])
    await openDeleteDialog(queryClient)
    typeConfirmation(EMAIL)

    fireEvent.click(confirmButton())

    await waitFor(async () =>
      expect(await createLocalRepository().currentSession()).toBeNull(),
    )
    expect(queryClient.getQueryData(['projects'])).toBeUndefined()
    expect(useToastStore.getState().toasts[0]?.title).toBe('Account deleted')
  })
})
