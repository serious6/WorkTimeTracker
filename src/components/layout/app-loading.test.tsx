import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppLoading } from './app-loading'
import { LOADING_MESSAGE_INTERVAL_MS, LOADING_MESSAGES } from '@/lib/loading-messages'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function advance(steps = 1) {
  act(() => {
    vi.advanceTimersByTime(LOADING_MESSAGE_INTERVAL_MS * steps)
  })
}

describe('AppLoading', () => {
  test('announces the progress of the start', () => {
    render(<AppLoading />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Starting WorkTimeTracker…')
    expect(screen.getByTestId('loading-logo')).toBeInTheDocument()
  })

  test('takes the message of the step that is waited for', () => {
    render(<AppLoading message="Loading…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.getByTestId('loading-message')).toHaveTextContent('Loading…')
  })

  test('shows the next loading text after one and a half seconds', () => {
    render(<AppLoading />)

    advance()

    expect(screen.getByTestId('loading-message')).toHaveTextContent(LOADING_MESSAGES[0])
  })

  test('starts over after the last loading text', () => {
    render(<AppLoading message="Loading…" />)

    advance(LOADING_MESSAGES.length + 1)

    expect(screen.getByTestId('loading-message')).toHaveTextContent('Loading…')
  })

  test('announces only the initial message while the texts change', () => {
    render(<AppLoading />)

    advance()

    // The turning mark and the changing texts are hidden from the
    // announcement, so a screen reader reads the initial message only once.
    expect(screen.getByTestId('loading-logo')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('loading-message')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Starting WorkTimeTracker…')).toHaveClass('sr-only')
  })

  test('stops the texts when the loading screen is removed', () => {
    const { unmount } = render(<AppLoading />)

    unmount()

    expect(() => advance()).not.toThrow()
  })
})
