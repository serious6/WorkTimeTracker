/**
 * The boot screen of the window, shown before React mounts.
 *
 * A failure of the module graph — a bundle that does not load, a module that
 * throws while it is evaluated — happens before any component exists, so
 * nothing would replace the spinner `index.html` renders. This module runs
 * first and turns such a failure into the same panel the application shows for
 * a failed start. The content security policy of the webview forbids inline
 * scripts, so it is a module of its own instead of a script tag in the page.
 */

const BOOT_ROOT_ID = 'root'
const BOOT_MARKER = '[data-boot-screen]'
const TITLE = 'WorkTimeTracker could not start'
const FALLBACK = 'The application could not be loaded.'

export type BootWatch = {
  /** The application mounted; later failures are its own to report. */
  finish: () => void
}

function messageOf(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message
  if (typeof reason === 'string' && reason.trim()) return reason
  return FALLBACK
}

/**
 * Replaces the boot spinner with the failure. Written with DOM calls instead of
 * `innerHTML`, so no part of the message can be read as markup.
 */
export function showBootError(document: Document, message: string): void {
  const root = document.getElementById(BOOT_ROOT_ID)
  if (!root) return

  const screen = document.createElement('div')
  screen.className = 'boot-screen'
  screen.setAttribute('role', 'alert')

  const heading = document.createElement('h1')
  heading.className = 'boot-title'
  heading.textContent = TITLE

  const text = document.createElement('p')
  text.className = 'boot-text'
  text.textContent = message

  const button = document.createElement('button')
  button.className = 'boot-button'
  button.type = 'button'
  button.textContent = 'Reload'
  button.addEventListener('click', () => document.defaultView?.location.reload())

  screen.append(heading, text, button)
  root.replaceChildren(screen)
}

/**
 * Watches for failures until the application mounts. Errors after the mount
 * belong to the running application, which reports them itself.
 */
export function watchBoot(target: Window): BootWatch {
  let done = false
  const report = (reason: unknown) => {
    if (done) return
    done = true
    showBootError(target.document, messageOf(reason))
  }

  target.addEventListener('error', (event: ErrorEvent) => report(event.error ?? event.message))
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) =>
    report(event.reason),
  )

  return {
    finish: () => {
      done = true
    },
  }
}

/**
 * The watch of the running window. It starts only where the boot screen of
 * `index.html` exists, so importing this module in a test observes nothing.
 */
const watch: BootWatch =
  typeof window !== 'undefined' && window.document.querySelector(BOOT_MARKER)
    ? watchBoot(window)
    : { finish: () => {} }

export function bootFinished(): void {
  watch.finish()
}
