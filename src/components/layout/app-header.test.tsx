import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { renderWithProviders, resetAppState, signIn } from '@/test/harness'
import { AppHeader } from './app-header'

beforeEach(async () => {
  await resetAppState()
})

describe('AppHeader', () => {
  test('shows the current user email', async () => {
    const user = await signIn('header-test@example.com')
    renderWithProviders(<AppHeader user={user} />)
    expect(screen.getByText('header-test@example.com')).toBeInTheDocument()
  })

  test('shows account menu button', async () => {
    const user = await signIn('header-test2@example.com')
    renderWithProviders(<AppHeader user={user} />)
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  test('opens menu and shows Logout and Switch User options', async () => {
    const user = await signIn('header-menu@example.com')
    renderWithProviders(<AppHeader user={user} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Switch User' })).toBeInTheDocument()
  })

  test('clicking Logout closes the menu', async () => {
    const user = await signIn('header-logout@example.com')
    renderWithProviders(<AppHeader user={user} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('clicking Switch User closes the menu', async () => {
    const user = await signIn('header-switch@example.com')
    renderWithProviders(<AppHeader user={user} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Switch User' }))
    })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
