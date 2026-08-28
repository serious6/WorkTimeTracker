import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  TEST_PASSWORD,
  renderWithProviders,
  resetAppState,
  signIn,
} from '@/test/harness'
import { LoginPage } from '../login-page'

beforeEach(async () => {
  await resetAppState()
})

describe('LoginPage', () => {
  test('renders the sign-in heading', () => {
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows validation error for empty email', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows invalid credentials error on wrong password', async () => {
    const user = userEvent.setup()
    await signIn('login-test@example.com')
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    await user.type(screen.getByLabelText(/email/i), 'login-test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'WrongPassword!')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('calls onRegister when Register button is clicked', async () => {
    const user = userEvent.setup()
    let called = false
    renderWithProviders(<LoginPage onRegister={() => { called = true }} />)
    await user.click(screen.getByRole('button', { name: 'Register' }))
    expect(called).toBe(true)
  })

  test('successful login navigates away (no error shown)', async () => {
    const user = userEvent.setup()
    await signIn('login-ok@example.com')
    // logout to reset session
    const { localRepository } = await import('@/features/storage/local-repository')
    await localRepository.logout()

    renderWithProviders(<LoginPage onRegister={() => {}} />)
    await user.type(screen.getByLabelText(/email/i), 'login-ok@example.com')
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
