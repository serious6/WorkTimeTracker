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

function acceptLegalTexts() {
  fireEvent.click(screen.getByLabelText('I accept the Terms of Service'))
  fireEvent.click(screen.getByLabelText('I accept the Privacy Policy'))
}

const legalTextHandlers = {
  onShowPrivacy: () => {},
  onShowTerms: () => {},
}

describe('UserCreationPage', () => {
  test('renders the heading', () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} {...legalTextHandlers} />)
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument()
  })

  test('calls onCancel when Cancel is clicked', () => {
    let cancelled = false
    renderWithProviders(<UserCreationPage onCancel={() => { cancelled = true }} {...legalTextHandlers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelled).toBe(true)
  })

  test('shows validation error for invalid email', async () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} {...legalTextHandlers} />)
    typeIntoForm('a@b', 'Str0ng-Passphrase!!x')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows error when password does not meet policy', async () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} {...legalTextHandlers} />)
    typeIntoForm('new@example.com', 'weak')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  test('shows password policy checklist', () => {
    renderWithProviders(<UserCreationPage onCancel={() => {}} {...legalTextHandlers} />)
    expect(screen.getByRole('list', { name: 'Password policy' })).toBeInTheDocument()
  })

  test('opens legal texts from the registration form', () => {
    const opened: string[] = []
    renderWithProviders(
      <UserCreationPage
        onCancel={() => {}}
        onShowPrivacy={() => { opened.push('privacy') }}
        onShowTerms={() => { opened.push('terms') }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Terms of Service' }))
    expect(opened).toEqual(['terms'])

    fireEvent.click(screen.getByRole('button', { name: 'Privacy Policy' }))
    expect(opened).toEqual(['terms', 'privacy'])
  })

  test('successful registration calls onSuccess', async () => {
    let succeeded = false
    renderWithProviders(
      <UserCreationPage onCancel={() => {}} onSuccess={() => { succeeded = true }} {...legalTextHandlers} />,
    )
    typeIntoForm('newuser@example.com', 'Str0ng-Passphrase!!x')
    acceptLegalTexts()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(succeeded).toBe(true))
  })

  test('requires both legal texts before registration', async () => {
    let succeeded = false
    renderWithProviders(
      <UserCreationPage onCancel={() => {}} onSuccess={() => { succeeded = true }} {...legalTextHandlers} />,
    )
    typeIntoForm('newuser@example.com', 'Str0ng-Passphrase!!x')

    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You must accept the terms of service')
    expect(succeeded).toBe(false)

    fireEvent.click(screen.getByLabelText('I accept the Terms of Service'))
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You must accept the privacy policy')
    expect(succeeded).toBe(false)
  })

  test('shows error when email is already taken', async () => {
    const { createLocalRepository } = await import('@/features/storage/local-repository')
    await createLocalRepository().register({ email: 'dup@example.com', password: 'Str0ng-Passphrase!!x' })
    await createLocalRepository().logout()

    renderWithProviders(<UserCreationPage onCancel={() => {}} {...legalTextHandlers} />)
    typeIntoForm('dup@example.com', 'Str0ng-Passphrase!!x')
    acceptLegalTexts()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
