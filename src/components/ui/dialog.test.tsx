import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Dialog } from './dialog'

function renderDialog(open: boolean, onClose = vi.fn()) {
  render(
    <Dialog description="Dialog description" onClose={onClose} open={open} title="Test Dialog">
      <button type="button">First</button>
      <button type="button">Last</button>
    </Dialog>,
  )
  return onClose
}

beforeEach(() => vi.clearAllMocks())

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

  test('calls onClose when close button is clicked', () => {
    const onClose = renderDialog(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('calls onClose on Escape key', () => {
    const onClose = renderDialog(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('a new onClose identity does not move focus from an input', () => {
    const { rerender } = render(
      <Dialog onClose={() => {}} open title="Stable focus">
        <input aria-label="Name" />
      </Dialog>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    input.focus()

    rerender(
      <Dialog onClose={() => {}} open title="Stable focus">
        <input aria-label="Name" />
      </Dialog>,
    )

    expect(input).toHaveFocus()
  })

  test('autofocus skips hidden inputs', () => {
    render(
      <Dialog onClose={() => {}} open title="Visible focus">
        <input type="hidden" />
        <input aria-label="Name" />
      </Dialog>,
    )

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
  })

  test('autofocus skips controls hidden by attributes, ancestors, or CSS', () => {
    render(
      <Dialog onClose={() => {}} open title="Visible focus">
        <input aria-label="Hidden attribute" hidden />
        <div aria-hidden="true">
          <input aria-label="Aria hidden ancestor" />
        </div>
        <div inert={true}>
          <input aria-label="Inert ancestor" />
        </div>
        <div style={{ display: 'none' }}>
          <input aria-label="Display none ancestor" />
        </div>
        <input aria-label="Visible" />
      </Dialog>,
    )

    expect(screen.getByRole('textbox', { name: 'Visible' })).toHaveFocus()
  })

  test('autofocus falls back to the first focusable control when an input rejects focus', () => {
    render(
      <Dialog onClose={() => {}} open title="Panel focus">
        <input aria-label="Hidden attribute" hidden />
      </Dialog>,
    )

    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  test('labels the dialog with the title and describes it with the description', () => {
    renderDialog(true)
    const dialog = screen.getByRole('dialog', { name: 'Test Dialog' })
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Dialog description')
  })

  test('does not describe the dialog when no description is provided', () => {
    render(
      <Dialog onClose={vi.fn()} open title="No Desc">
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'No Desc' })).not.toHaveAttribute('aria-describedby')
  })

  test('does not render description when not provided', () => {
    render(
      <Dialog onClose={vi.fn()} open title="No Desc">
        <span>content</span>
      </Dialog>,
    )
    expect(screen.getByText('No Desc')).toBeInTheDocument()
  })

  test('Tab wraps focus from the last control to the first', () => {
    renderDialog(true)
    const first = screen.getByRole('button', { name: 'Close dialog' })
    screen.getByRole('button', { name: 'Last' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  test('Shift+Tab wraps focus from the first control to the last', () => {
    renderDialog(true)
    const last = screen.getByRole('button', { name: 'Last' })
    screen.getByRole('button', { name: 'Close dialog' }).focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  test('non-escape/tab keys are ignored', () => {
    const onClose = renderDialog(true)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  test('dialog renders nothing after being closed (open=false)', () => {
    const { rerender } = render(
      <Dialog onClose={vi.fn()} open title="Closeable">
        <span>child</span>
      </Dialog>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    rerender(
      <Dialog onClose={vi.fn()} open={false} title="Closeable">
        <span>child</span>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
