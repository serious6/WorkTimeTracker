import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Dialog } from './dialog'

function renderDialog(open: boolean, onClose = vi.fn()) {
  const appRoot = document.createElement('div')
  appRoot.id = 'root'
  document.body.append(appRoot)
  render(
    <Dialog description="Dialog description" onClose={onClose} open={open} title="Test Dialog">
      <button type="button">First</button>
      <button type="button">Last</button>
    </Dialog>,
    { container: appRoot },
  )
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
  document.querySelectorAll('#root').forEach((element) => element.remove())
  document.body.style.overflow = ''
})

describe('Dialog', () => {
  test('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('renders title and description when open', () => {
    renderDialog(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-backdrop').parentElement).toBe(document.body)
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

  test('calls onClose when the backdrop is clicked', () => {
    const onClose = renderDialog(true)
    fireEvent.mouseDown(screen.getByTestId('dialog-backdrop'))
    fireEvent.click(screen.getByTestId('dialog-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('does not close when a drag starts in the panel and ends on the backdrop', () => {
    const onClose = renderDialog(true)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    fireEvent.click(screen.getByTestId('dialog-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
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

  test('returns stray focus to the dialog', () => {
    renderDialog(true)
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    fireEvent.focusIn(outside)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  test('keeps the application root unavailable while open and restores trigger focus on close', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)
    const content = (open: boolean) => (
      <>
        <button type="button">Trigger</button>
        <Dialog onClose={vi.fn()} open={open} title="Modal">
          <span>content</span>
        </Dialog>
      </>
    )
    const { rerender } = render(
      content(false),
      { container: appRoot },
    )
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    trigger.focus()
    rerender(content(true))

    if ('inert' in appRoot) {
      expect(appRoot).toHaveAttribute('inert')
    } else {
      expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    }
    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    rerender(content(false))
    expect(trigger).toHaveFocus()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  test('preserves an application root that was already inert', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    appRoot.setAttribute('inert', '')
    document.body.append(appRoot)
    const { rerender } = render(<Dialog onClose={vi.fn()} open title="Modal" />, { container: appRoot })

    rerender(<Dialog onClose={vi.fn()} open={false} title="Modal" />)

    expect(appRoot).toHaveAttribute('inert')
  })

  test('keeps body scroll locked until every stacked dialog closes', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)
    const content = (firstOpen: boolean, secondOpen: boolean) => (
      <>
        <Dialog onClose={vi.fn()} open={firstOpen} title="First">
          <span>content</span>
        </Dialog>
        <Dialog onClose={vi.fn()} open={secondOpen} title="Second">
          <span>content</span>
        </Dialog>
      </>
    )
    const { rerender } = render(content(true, true), { container: appRoot })

    rerender(content(false, true))
    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    rerender(content(false, false))
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  test('hides the underlying dialog until the top dialog closes', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)
    const content = (firstOpen: boolean, secondOpen: boolean) => (
      <>
        <Dialog onClose={vi.fn()} open={firstOpen} title="First" />
        <Dialog onClose={vi.fn()} open={secondOpen} title="Second" />
      </>
    )
    const { rerender } = render(content(true, true), { container: appRoot })
    const [first] = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))

    if ('inert' in first) {
      expect(first).toHaveAttribute('inert')
    } else {
      expect(first).toHaveAttribute('aria-hidden', 'true')
    }

    rerender(content(true, false))
    expect(first).not.toHaveAttribute('inert')
    expect(first).not.toHaveAttribute('aria-hidden', 'true')
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
