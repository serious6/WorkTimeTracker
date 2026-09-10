import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { StartupError } from './startup-error'

describe('StartupError', () => {
  test('shows the failure as the content of the window instead of a dialog', () => {
    render(
      <StartupError
        actionLabel="Retry"
        message="postgres: could not connect"
        onAction={() => {}}
        title="WorkTimeTracker could not start"
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('WorkTimeTracker could not start')
    expect(alert).toHaveTextContent('postgres: could not connect')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('runs the action of the panel', () => {
    const onAction = vi.fn()
    render(
      <StartupError actionLabel="Retry" message="no database" onAction={onAction} title="Failed" />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  test('blocks the action and turns the spinner while it runs', () => {
    const onAction = vi.fn()
    render(
      <StartupError
        actionLabel="Retrying…"
        busy
        message="no database"
        onAction={onAction}
        title="Failed"
      />,
    )

    const button = screen.getByRole('button', { name: /retrying/i })
    expect(button).toBeDisabled()
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })
})
