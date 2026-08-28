import { beforeEach, describe, expect, it } from 'vitest'
import { errorToast, toast, useToastStore } from './toast-store'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('toast store', () => {
  it('adds a default toast with a title and description', () => {
    toast('Timer started', 'Tracking Website Redesign')

    expect(useToastStore.getState().toasts).toMatchObject([
      { title: 'Timer started', description: 'Tracking Website Redesign', variant: 'default' },
    ])
  })

  it('marks failures as destructive', () => {
    errorToast('Unable to start the timer')

    expect(useToastStore.getState().toasts[0]).toMatchObject({
      title: 'Unable to start the timer',
      description: undefined,
      variant: 'destructive',
    })
  })

  it('keeps toasts of the same millisecond apart', () => {
    toast('First')
    toast('Second')
    toast('Third')

    const ids = useToastStore.getState().toasts.map((entry) => entry.id)

    expect(new Set(ids).size).toBe(3)
  })

  it('dismisses only the requested toast', () => {
    toast('First')
    toast('Second')
    const [first] = useToastStore.getState().toasts

    useToastStore.getState().dismiss(first.id)

    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0].title).toBe('Second')
  })

  it('ignores an unknown toast id', () => {
    toast('First')

    useToastStore.getState().dismiss(-1)

    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
