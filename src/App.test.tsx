import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useNavigationStore } from '@/app/navigation'
import { TEST_PASSWORD, resetAppState, signIn } from '@/test/harness'
import App from './App'

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

beforeEach(async () => {
  await resetAppState()
})

describe('App shell', () => {
  test('shows login page when no user is signed in', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  test('navigates to registration view when Register is clicked', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /sign in/i })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument()
  })

  test('registration view returns to login on Cancel', async () => {
    renderApp()
    await screen.findByRole('heading', { name: /sign in/i })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    await screen.findByRole('heading', { name: /create your account/i })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows app shell with sidebar after sign in', async () => {
    await signIn('app-test@example.com')
    renderApp()
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByText('app-test@example.com')).toBeInTheDocument()
  })

  test('skips to the main content', async () => {
    await signIn('skip-link-test@example.com')
    renderApp()
    const main = await screen.findByRole('main')
    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }))
    expect(main).toHaveFocus()
  })

  test('navigating to Settings shows the settings page', async () => {
    await signIn('nav-test@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('settings')
    expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  test('navigating to Reports shows the reports page', async () => {
    await signIn('nav-reports@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('reports')
    expect(await screen.findByRole('heading', { name: /reports/i })).toBeInTheDocument()
  })

  test('navigating to Week shows the week page', async () => {
    await signIn('nav-week@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('week')
    expect(await screen.findByRole('heading', { name: /week/i })).toBeInTheDocument()
  })

  test('navigating to Calendar shows the calendar page', async () => {
    await signIn('nav-calendar@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('calendar')
    expect(await screen.findByRole('heading', { name: /calendar/i })).toBeInTheDocument()
  })

  test('navigating to Overtime shows the overtime management page', async () => {
    await signIn('nav-overtime@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('overtime')
    expect(
      await screen.findByRole('heading', { name: /^Overtime$/ }),
    ).toBeInTheDocument()
  })

  test('navigating to Third-Party Licenses shows the license notices page', async () => {
    await signIn('nav-licenses@example.com')
    renderApp()
    await screen.findByRole('navigation', { name: 'Main' })
    useNavigationStore.getState().navigate('licenses')
    expect(useNavigationStore.getState().view).toBe('licenses')
  })

  test('logout returns to login page', async () => {
    await signIn('logout-app@example.com')
    const { queryClient } = renderApp()
    await screen.findByRole('navigation', { name: 'Main' })

    queryClient.setQueryData(['session'], null)
    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  test('logs in through the login form', async () => {
    await signIn('form-login@example.com')
    const { createLocalRepository } = await import('@/features/storage/local-repository')
    await createLocalRepository().logout()

    renderApp()
    await screen.findByRole('heading', { name: /sign in/i })
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'form-login@example.com' },
    })
    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: TEST_PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})
