import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AppLoading } from './app-loading'

describe('AppLoading', () => {
  test('announces the progress of the start', () => {
    render(<AppLoading />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Starting WorkTimeTracker…')
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  test('takes the message of the step that is waited for', () => {
    render(<AppLoading message="Loading…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })
})
