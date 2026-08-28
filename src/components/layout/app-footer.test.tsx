import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { appVersionKeys } from '@/features/app-info/use-app-version'
import { AppFooter } from './app-footer'

const getAppVersion = vi.fn<() => Promise<string | null>>()

vi.mock('@/features/storage', () => ({ repository: { getAppVersion: () => getAppVersion() } }))

function renderFooter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AppFooter />
    </QueryClientProvider>,
  )
  return queryClient
}

beforeEach(() => {
  getAppVersion.mockReset()
})

test('shows the attribution and the stored version', async () => {
  getAppVersion.mockResolvedValue('1.4.2')
  renderFooter()

  expect(screen.getByText('Build with ❤️ in Hamburg')).toBeInTheDocument()
  expect(await screen.findByText('v1.4.2')).toBeInTheDocument()
})

test('keeps the attribution when the version is unavailable', async () => {
  getAppVersion.mockRejectedValue(new Error('database unavailable'))
  const queryClient = renderFooter()

  await waitFor(() =>
    expect(queryClient.getQueryState(appVersionKeys.all)?.status).toBe('error'),
  )

  expect(screen.getByText('Build with ❤️ in Hamburg')).toBeInTheDocument()
  expect(screen.queryByText(/^v/)).not.toBeInTheDocument()
})
