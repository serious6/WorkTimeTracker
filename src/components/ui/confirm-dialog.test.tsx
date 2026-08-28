import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'

function renderConfirm({
  open = true,
  onConfirm = vi.fn(),
  onClose = vi.fn(),
} = {}) {
  render(
    <ConfirmDialog
      confirmLabel="Delete"
      description="This cannot be undone."
      onClose={onClose}
      onConfirm={onConfirm}
      open={open}
      title="Confirm deletion"
    />,
  )
  return { onConfirm, onClose }
}

beforeEach(() => vi.clearAllMocks())

describe('ConfirmDialog', () => {
  test('is not in DOM when closed', () => {
    renderConfirm({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('shows title, description and action label when open', () => {
    renderConfirm()
    expect(screen.getByText('Confirm deletion')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  test('calls onConfirm and onClose when confirmed', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = renderConfirm()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('calls only onClose when cancelled', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = renderConfirm()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderConfirm()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
