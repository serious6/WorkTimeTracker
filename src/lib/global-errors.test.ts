import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockReportError = vi.fn()
vi.mock('./logger', () => ({
  reportError: (source: string, error: unknown) => mockReportError(source, error),
}))

const { listenForUnhandledErrors, stopListeningForUnhandledErrors } = await import(
  './global-errors',
)

beforeEach(() => {
  mockReportError.mockReset()
})

afterEach(() => {
  stopListeningForUnhandledErrors()
})

describe('listenForUnhandledErrors', () => {
  test('logs uncaught exceptions', () => {
    listenForUnhandledErrors()
    const failure = new Error('boom')

    window.dispatchEvent(new ErrorEvent('error', { error: failure, message: 'boom' }))

    expect(mockReportError).toHaveBeenCalledWith('window', failure)
  })

  test('logs rejected promises', () => {
    listenForUnhandledErrors()
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    event.reason = 'rejected'

    window.dispatchEvent(event)

    expect(mockReportError).toHaveBeenCalledWith('promise', 'rejected')
  })

  test('registers the listeners only once', () => {
    listenForUnhandledErrors()
    listenForUnhandledErrors()

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }))

    expect(mockReportError).toHaveBeenCalledTimes(1)
  })
})
