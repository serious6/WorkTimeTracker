import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  TEST_PASSWORD,
  renderWithProviders,
  resetAppState,
  signIn,
} from '@/test/harness'
import { LoginPage } from './login-page'

beforeEach(async () => {
  await resetAppState()
})

describe('LoginPage', () => {
  test('renders the sign-in heading', () => {
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  test('exposes the form identity password managers look for', () => {
    renderWithProviders(<LoginPage onRegister={() => {}} />)

    const form = document.querySelector('form')!
    expect(form).toHaveAttribute('id', 'login-form')
    expect(form).toHaveAttribute('name', 'login-form')
    expect(form).toHaveAttribute('method', 'post')

    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('id', 'email')
    expect(email).toHaveAttribute('name', 'email')
    expect(email).toHaveAttribute('autocomplete', 'username')

    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('id', 'password')
    expect(password).toHaveAttribute('name', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')

    expect(screen.getByRole('button', { name: 'Login' })).toHaveAttribute('type', 'submit')
  })

  test('names the window so a saved credential is recognisable', () => {
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    expect(document.title).toBe('WorkTimeTracker — Sign in')
  })

  test('shows validation error when password is empty', async () => {
    renderWithProviders(<LoginPage onRegister={() => {}} />)
    // type a valid email but no password
    const emailInput = document.querySelector('input[name="email"]')!
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows invalid credentials error on wrong password', async () => {
    await signIn('login-test@example.com')
    const { createLocalRepository } = await import('@/features/storage/local-repository')
    await createLocalRepository().logout()
    renderWithProviders(<LoginPage onRegister={() => {}} />)

    fireEvent.change(document.querySelector('input[name="email"]')!, {
      target: { value: 'login-test@example.com' },
    })
    fireEvent.change(document.querySelector('input[name="password"]')!, {
      target: { value: 'WrongPassword!WrongPassword!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('calls onRegister when Register button is clicked', () => {
    let called = false
    renderWithProviders(<LoginPage onRegister={() => { called = true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(called).toBe(true)
  })

  test('successful login shows no error', async () => {
    await signIn('login-ok@example.com')
    const { createLocalRepository } = await import('@/features/storage/local-repository')
    await createLocalRepository().logout()

    renderWithProviders(<LoginPage onRegister={() => {}} />)
    fireEvent.change(document.querySelector('input[name="email"]')!, {
      target: { value: 'login-ok@example.com' },
    })
    fireEvent.change(document.querySelector('input[name="password"]')!, {
      target: { value: TEST_PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(async () => {
      expect(await createLocalRepository().currentSession()).toMatchObject({
        email: 'login-ok@example.com',
      })
    })
  })
})
