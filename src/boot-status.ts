/**
 * The boot screen of the window, shown before React mounts.
 *
 * A failure of the module graph — a bundle that does not load, a module that
 * throws while it is evaluated — happens before any component exists, so
 * nothing would replace the logo `index.html` renders. This module runs first,
 * cycles the loading texts under that logo, and turns such a failure into the
 * same panel the application shows for a failed start. The content security
 * policy of the webview forbids inline scripts, so it is a module of its own
 * instead of a script tag in the page.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { LOADING_MESSAGE_INTERVAL_MS, loadingMessageAt } from './lib/loading-messages.ts'

const BOOT_ROOT_ID = 'root'
const BOOT_MARKER = '[data-boot-screen]'
const BOOT_TEXT_MARKER = '[data-boot-text]'
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
 * Replaces the boot screen with the failure. Written with DOM calls instead of
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
 * Cycles the loading texts under the boot logo until the window is handed over.
 * The application repeats this with `useLoadingMessage` once React mounts, so
 * the text keeps changing across the mount.
 */
export function rotateBootText(document: Document): () => void {
  const text = document.querySelector(BOOT_TEXT_MARKER)
  if (!text) return () => {}

  const initial = text.textContent ?? ''
  let step = 0
  const interval = setInterval(() => {
    step += 1
    text.textContent = loadingMessageAt(initial, step)
  }, LOADING_MESSAGE_INTERVAL_MS)

  return () => clearInterval(interval)
}

/**
 * Watches for failures until the application mounts. Errors after the mount
 * belong to the running application, which reports them itself.
 */
export function watchBoot(target: Window): BootWatch {
  let done = false
  const stopText = rotateBootText(target.document)
  const report = (reason: unknown) => {
    if (done) return
    done = true
    stopText()
    showBootError(target.document, messageOf(reason))
  }

  target.addEventListener('error', (event: ErrorEvent) => report(event.error ?? event.message))
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) =>
    report(event.reason),
  )

  return {
    finish: () => {
      done = true
      stopText()
    },
  }
}

/**
 * The time the start may take from the launch of the process until this loading
 * page is on screen. Mirrors `boot::BUDGET` of the backend, which measures the
 * boot against it and writes the result to the log file.
 */
export const BOOT_BUDGET_MS = 1000

/**
 * Tells the backend that the loading page is on screen, which ends its boot
 * measurement. The call is made after the first frame — a frame callback runs
 * before the paint, the timeout behind it after — and never awaited, so the
 * measurement cannot delay the boot it measures. Outside the desktop
 * application there is no backend to report to.
 */
export function reportLoadingPage(target: Window): void {
  if (!isTauri()) return
  target.requestAnimationFrame(() => {
    target.setTimeout(() => {
      void invoke('loading_page_shown').catch(() => {})
    }, 0)
  })
}

/**
 * The watch of the running window. It starts only where the boot screen of
 * `index.html` exists, so importing this module in a test observes nothing.
 */
const bootScreen =
  typeof window === 'undefined' ? null : window.document.querySelector(BOOT_MARKER)
const watch: BootWatch = bootScreen ? watchBoot(window) : { finish: () => {} }
if (bootScreen) reportLoadingPage(window)

export function bootFinished(): void {
  watch.finish()
}
