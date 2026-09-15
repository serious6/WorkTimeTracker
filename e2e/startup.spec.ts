import { expect, test } from '@playwright/test'
import { BOOT_BUDGET_MS } from '../src/boot-status'
import { STARTUP_FAILURE_KEY } from '../src/features/storage/local-repository'

/**
 * The window reports what the start is doing: the turning brand logo while it
 * runs and the failure inside the application when it cannot finish. Neither is
 * a dialog, and neither switches the mouse cursor to a busy one.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

// #ST1 in docs/e2e-test-cases.md
test('ST1: shows the startup logo before the application appears', async ({ page }) => {
  // The bundle is held back so the state before the mount can be read at all.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/assets/*.js', async (route) => {
    await held
    await route.continue()
  })

  const loaded = page.goto('/')
  await expect(page.locator('[data-boot-screen]')).toContainText('Starting WorkTimeTracker')

  release()
  await loaded
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
  await expect(page.locator('[data-boot-screen]')).toHaveCount(0)
})

// #ST2 in docs/e2e-test-cases.md
test('ST2: shows a failed start in the window and recovers on a retry', async ({ page }) => {
  await page.evaluate(
    ([key]) => localStorage.setItem(key, 'postgres: could not connect to the database'),
    [STARTUP_FAILURE_KEY],
  )
  await page.reload()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('WorkTimeTracker could not start')
  await expect(alert).toContainText('postgres: could not connect to the database')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeHidden()

  await page.evaluate(([key]) => localStorage.removeItem(key), [STARTUP_FAILURE_KEY])
  await page.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
})

// #ST3 in docs/e2e-test-cases.md
test('ST3: keeps reporting the failure when the retry fails again', async ({ page }) => {
  await page.evaluate(([key]) => localStorage.setItem(key, 'the database is still gone'), [
    STARTUP_FAILURE_KEY,
  ])
  await page.reload()

  await page.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('alert')).toContainText('the database is still gone')
})

// #ST4 in docs/e2e-test-cases.md
test('ST4: turns the logo while loading instead of showing a busy cursor', async ({ page }) => {
  // The bundle is held back so the state before the mount can be read at all.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/assets/*.js', async (route) => {
    await held
    await route.continue()
  })

  const loaded = page.goto('/')
  const logo = page.locator('[data-boot-logo]')
  await expect(logo).toBeVisible()

  const loading = await logo.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    cursor: getComputedStyle(element.ownerDocument.body).cursor,
  }))
  expect(loading.animation).toBe('boot-spin')
  expect(loading.cursor).toBe('auto')

  release()
  await loaded
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
})

/** How long the test waits for the paint entry of the loading page. */
const PAINT_TIMEOUT_MS = 5000

// #ST5 in docs/e2e-test-cases.md
test('ST5: paints the loading page inside the boot budget', async ({ page }) => {
  await page.goto('/')

  // The first contentful paint is the loading page of `index.html`, which needs
  // no bundle. It is measured from the start of the navigation, so it covers
  // the part of the boot the frontend owns; the backend measures its own part
  // and logs it (see `src-tauri/src/boot.rs`). The entry reaches the timeline
  // after the frame it describes, so it is observed instead of read once.
  const paint = await page.evaluate(
    (timeout) =>
      new Promise<number | null>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entry = list.getEntriesByName('first-contentful-paint')[0]
          if (!entry) return
          observer.disconnect()
          resolve(entry.startTime)
        })
        observer.observe({ type: 'paint', buffered: true })
        setTimeout(() => {
          observer.disconnect()
          resolve(null)
        }, timeout)
      }),
    PAINT_TIMEOUT_MS,
  )

  expect(paint).not.toBeNull()
  expect(paint).toBeLessThan(BOOT_BUDGET_MS)
  await expect(page.getByRole('heading', { name: 'Sign in to TimeTrack' })).toBeVisible()
})
