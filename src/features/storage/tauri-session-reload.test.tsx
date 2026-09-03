import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// The mock stands in for the native backend and must exist before the module
// under test is imported.
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => mockInvoke(command, args),
  isTauri: () => false,
}))

const { tauriRepository } = await import('./tauri-repository')
const { setRepository } = await import('./index')
const { default: App } = await import('@/App')
const { useNavigationStore } = await import('@/app/navigation')
const { useTimerStore } = await import('@/features/timer/timer-store')

const USER = { id: 1, email: 'native@example.com', createdAt: '2026-01-01T00:00:00.000Z' }
const PROJECT = {
  id: 1,
  name: 'Native Project',
  description: null,
  color: '#22c55e',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const SETTINGS = {
  weeklyTargetMinutes: 2400,
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekStartsOn: 'monday',
}
const SESSION_ID = 'a'.repeat(64)

/** The one session the stand-in backend keeps in memory, like `auth::Sessions`. */
let openSession = ''

/** Answers a command only for the session it was started for. */
function nativeBackend(command: string, { sessionId }: { sessionId: string }): unknown {
  if (command === 'login' || command === 'register') {
    openSession = SESSION_ID
    return { user: USER, sessionId: SESSION_ID }
  }
  if (command === 'logout') {
    openSession = ''
    return null
  }
  const signedIn = sessionId !== '' && sessionId === openSession
  if (command === 'current_session') return signedIn ? USER : null
  if (!signedIn) throw { kind: 'notSignedIn', message: 'Please sign in again.' }
  if (command === 'list_projects') return [PROJECT]
  if (command === 'get_work_settings') return SETTINGS
  if (command === 'get_app_version') return '1.0.0'
  return []
}

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

/** Signs in through the login form, the way the user reaches the application. */
async function signInThroughForm() {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: USER.email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Str0ng-Passphrase!!x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Login' }))
}

beforeEach(async () => {
  openSession = ''
  mockInvoke.mockReset()
  mockInvoke.mockImplementation(nativeBackend)
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  // The session lives in a module variable, so a test signs out before it runs.
  await tauriRepository.logout()
  setRepository(tauriRepository)
  useTimerStore.setState({ session: null, recovered: false })
  useNavigationStore.getState().navigate('dashboard')
})

/**
 * The desktop frontend keeps the id of its session in a module variable, so a
 * reload of the webview must land on the login page instead of resuming the
 * session with a token some page script could have read.
 */
describe('desktop session across a reload of the webview', () => {
  test('a signed in user reaches the application and its data', async () => {
    renderApp()
    await signInThroughForm()

    expect(await screen.findByText(USER.email)).toBeInTheDocument()
    useNavigationStore.getState().navigate('projects')
    expect(await screen.findByText(PROJECT.name)).toBeInTheDocument()
  })

  test('a reload returns to the login page and shows no data of the user', async () => {
    const signedIn = renderApp()
    await signInThroughForm()
    await screen.findByText(USER.email)
    signedIn.unmount()

    // A reload evaluates the modules and the query cache again; nothing outside
    // them kept the id of the session.
    vi.resetModules()
    const { tauriRepository: reloaded } = await import('./tauri-repository')
    setRepository(reloaded)
    renderApp()

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText(USER.email)).not.toBeInTheDocument()
    expect(screen.queryByText(PROJECT.name)).not.toBeInTheDocument()
    expect(mockInvoke).toHaveBeenLastCalledWith('current_session', { sessionId: '' })
  })
})
