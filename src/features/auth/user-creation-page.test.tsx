import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { renderWithProviders, resetAppState } from '@/test/harness'
import { UserCreationPage } from './user-creation-page'

beforeEach(async () => {
  await resetAppState()
})

function typeIntoForm(email: string, pw: string) {
  const emailInput = document.querySelector('input[name="email"]')!
  const pwInput = document.querySelector('input[name="password"]')!
  fireEvent.change(emailInput, { target: { value: email } })
  fireEvent.change(pwInput, { target: { value: pw } })
}

describe('UserCreationPage', () => {
  test('renders the heading', () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} />)
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument()
  })

  test('calls onCancel when Cancel is clicked', () => {
    let cancelled = false
    renderWithProviders(<UserCreationPage onCancel={() => { cancelled = true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelled).toBe(true)
  })

  test('shows validation error for invalid email', async () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} />)
    typeIntoForm('a@b', 'Str0ng-Passphrase!!x')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows error when password does not meet policy', async () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} />)
    typeIntoForm('new@example.com', 'weak')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows password policy checklist', () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} />)
    expect(screen.getByRole('list', { name: 'Password policy' })).toBeInTheDocument()
  })

  test('successful registration calls onSuccess', async () => {
    let succeeded = false
    renderWithProviders(<UserCreationPage onCancel={() => {}} onSuccess={() => { succeeded = true }} />)
    typeIntoForm('newuser@example.com', 'Str0ng-Passphrase!!x')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(succeeded).toBe(true))
  })

  test('shows error when email is already taken', async () => {
    const { localRepository } = await import('@/features/storage/local-repository')
    await localRepository.register({ email: 'dup@example.com', password: 'Str0ng-Passphrase!!x' })
    await localRepository.logout()

    renderWithProviders(<UserCreationPage onCancel={() => {}} />)
    typeIntoForm('dup@example.com', 'Str0ng-Passphrase!!x')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
