import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Dialog } from './dialog'

function renderDialog(open: boolean, onClose = vi.fn()) {
  render(
    <Dialog description="Dialog description" onClose={onClose} open={open} title="Test Dialog">
      <button type="button">Action</button>
    </Dialog>,
  )
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Dialog', () => {
  test('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('renders title and description when open', () => {
    renderDialog(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Test Dialog')).toBeInTheDocument()
    expect(screen.getByText('Dialog description')).toBeInTheDocument()
  })

  test('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = renderDialog(true)
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('calls onClose on Escape key', async () => {
    const user = userEvent.setup()
    const onClose = renderDialog(true)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('does not render description when not provided', () => {
    const onClose = vi.fn()
    render(
      <Dialog onClose={onClose} open title="No Desc">
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByText('No Desc')).toBeInTheDocument()
  })
})
