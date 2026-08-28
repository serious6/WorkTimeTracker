import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppProviders } from './providers'

type Client = ReturnType<typeof useQueryClient>

function Inspector({ onClient }: { onClient: (client: Client) => void }) {
  onClient(useQueryClient())
  return <span>inspected</span>
}

test('renders the application below the query client', () => {
  const clients: Client[] = []
  render(
    <AppProviders>
      <Inspector onClient={(client) => clients.push(client)} />
    </AppProviders>,
  )

  expect(screen.getByText('inspected')).toBeInTheDocument()
  expect(clients[0].getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, retry: false })
})

test('keeps the same query client across re-renders', () => {
  const clients: Client[] = []
  const view = render(
    <AppProviders>
      <Inspector onClient={(client) => clients.push(client)} />
    </AppProviders>,
  )

  view.rerender(
    <AppProviders>
      <Inspector onClient={(client) => clients.push(client)} />
    </AppProviders>,
  )

  expect(clients.length).toBeGreaterThan(1)
  expect(clients[clients.length - 1]).toBe(clients[0])
})
