import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, toDateKey } from '@/lib/date'
import {
  renderWithProviders,
  resetAppState,
  signIn,
} from '@/test/harness'
import { CustomDurationDialog } from './custom-duration-dialog'
import type { QuickAddInput } from '../use-quick-add'

beforeEach(async () => {
  await resetAppState()
  await signIn()
})

const FUTURE_DATE = toDateKey(addDays(new Date(), 7))

function render(overrides: Partial<React.ComponentProps<typeof CustomDurationDialog>> = {}) {
  const onAdd = vi.fn<(input: QuickAddInput) => Promise<void>>().mockResolvedValue(undefined)
  const onClose = vi.fn()
  renderWithProviders(
    <CustomDurationDialog
      open
      projectId={1}
      date={FUTURE_DATE}
      onAdd={onAdd}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onAdd, onClose }
}

describe('CustomDurationDialog', () => {
  it('renders the dialog title', () => {
    render()
    expect(screen.getByRole('heading', { name: /add custom time/i })).toBeInTheDocument()
  })

  it('shows duration format hint initially', () => {
    render()
    expect(screen.getByText(/accepts formats like/i)).toBeInTheDocument()
  })

  it('shows a preview when valid duration is typed', async () => {
    render()
    fireEvent.change(screen.getByPlaceholderText(/2h 45m/i), { target: { value: '1h 30m' } })
    expect(screen.getByText(/adds 1h 30m/i)).toBeInTheDocument()
  })

  it('shows validation error for invalid duration', async () => {
    render()
    fireEvent.change(screen.getByPlaceholderText(/2h 45m/i), { target: { value: 'xxx' } })
    fireEvent.click(screen.getByRole('button', { name: /add time/i }))
    expect(await screen.findByText(/enter a duration/i)).toBeInTheDocument()
  })

  it('shows error when no project is provided', async () => {
    render({ projectId: undefined })
    fireEvent.change(screen.getByPlaceholderText(/2h 45m/i), { target: { value: '1h' } })
    fireEvent.click(screen.getByRole('button', { name: /add time/i }))
    expect(await screen.findByText(/project is required/i)).toBeInTheDocument()
  })

  it('calls onAdd and onClose on valid submission', async () => {
    const { onAdd, onClose } = render()
    fireEvent.change(screen.getByPlaceholderText(/2h 45m/i), { target: { value: '2h' } })
    fireEvent.click(screen.getByRole('button', { name: /add time/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    const [arg] = onAdd.mock.calls[0] ?? []
    expect(arg?.minutes).toBe(120)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = render()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error from onAdd rejection', async () => {
    const onAdd = vi.fn<(input: QuickAddInput) => Promise<void>>().mockRejectedValue(new Error('Day full'))
    render({ onAdd })
    fireEvent.change(screen.getByPlaceholderText(/2h 45m/i), { target: { value: '1h' } })
    fireEvent.click(screen.getByRole('button', { name: /add time/i }))
    expect(await screen.findByText(/day full/i)).toBeInTheDocument()
  })
})
