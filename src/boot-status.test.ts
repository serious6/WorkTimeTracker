import { describe, expect, test, vi } from 'vitest'
import { showBootError, watchBoot } from './boot-status'

/** The window of the test with the boot markup `index.html` renders. */
function bootWindow(): Window {
  document.body.innerHTML = '<div id="root"><div data-boot-screen>Starting…</div></div>'
  return window
}

describe('boot status', () => {
  test('replaces the boot spinner with the failure before the application mounts', () => {
    const target = bootWindow()

    watchBoot(target)
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('module not loaded') }))

    expect(document.querySelector('[data-boot-screen]')).toBeNull()
    expect(document.body.textContent).toContain('WorkTimeTracker could not start')
    expect(document.body.textContent).toContain('module not loaded')
  })

  test('reports a rejected promise of the boot as well', () => {
    const target = bootWindow()

    watchBoot(target)
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', { value: new Error('chunk failed') })
    target.dispatchEvent(event)

    expect(document.body.textContent).toContain('chunk failed')
  })

  test('stays quiet once the application took the window over', () => {
    const target = bootWindow()

    const watch = watchBoot(target)
    watch.finish()
    target.dispatchEvent(new ErrorEvent('error', { error: new Error('later failure') }))

    expect(document.querySelector('[data-boot-screen]')).not.toBeNull()
    expect(document.body.textContent).not.toContain('later failure')
  })

  test('shows a failure without a message with the fallback text', () => {
    bootWindow()

    showBootError(document, 'The application could not be loaded.')

    expect(document.body.textContent).toContain('The application could not be loaded.')
  })

  test('writes the message as text, so it cannot be read as markup', () => {
    bootWindow()

    showBootError(document, '<img src=x onerror="broken">')

    expect(document.querySelector('img')).toBeNull()
    expect(document.body.textContent).toContain('<img src=x onerror="broken">')
  })

  test('reloads the window from the panel', () => {
    bootWindow()
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      reload,
    } as unknown as Location)

    showBootError(document, 'no bundle')
    document.querySelector<HTMLButtonElement>('.boot-button')?.click()

    expect(reload).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })
})
