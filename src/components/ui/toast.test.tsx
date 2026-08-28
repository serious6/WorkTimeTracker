import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useToastStore } from './toast-store'
import { Toaster } from './toast'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.clearAllMocks()
})

describe('Toaster', () => {
  test('renders nothing when there are no toasts', () => {
    render(<Toaster />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('shows a toast pushed to the store', () => {
    render(<Toaster />)
    act(() => {
      useToastStore.getState().push({ title: 'Saved', description: 'All good' })
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  test('removes a toast when dismissed', () => {
    render(<Toaster />)
    act(() => {
      useToastStore.getState().push({ title: 'Hi' })
    })
    const [toast] = useToastStore.getState().toasts
    act(() => {
      useToastStore.getState().dismiss(toast.id)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('auto-dismisses toast after 4 seconds', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      useToastStore.getState().push({ title: 'Auto-dismiss' })
    })
    expect(screen.getByText('Auto-dismiss')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4_001)
    })
    expect(screen.queryByText('Auto-dismiss')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  test('applies destructive border class for error variant', () => {
    render(<Toaster />)
    act(() => {
      useToastStore.getState().push({ title: 'Error', variant: 'destructive' })
    })
    const toast = screen.getByRole('status')
    expect(toast.className).toContain('border-destructive')
  })
})
