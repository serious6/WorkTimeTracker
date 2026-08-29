import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockReportError = vi.fn()
vi.mock('@/lib/logger', () => ({
  reportError: (source: string, error: unknown) => mockReportError(source, error),
}))

const { ErrorBoundary } = await import('./error-boundary')

function Boom(): never {
  throw new Error('render failed')
}

beforeEach(() => {
  mockReportError.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  test('renders its children while nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>content</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('content')).toBeInTheDocument()
    expect(mockReportError).not.toHaveBeenCalled()
  })

  test('logs the exception and offers a reload', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('The error was reported. Reload the application to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(mockReportError).toHaveBeenCalledWith('render', expect.any(Error))
  })
})
