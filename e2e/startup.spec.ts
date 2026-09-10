import { expect, test } from '@playwright/test'
import { STARTUP_FAILURE_KEY } from '../src/features/storage/local-repository'

/**
 * The window reports what the start is doing: a spinner while it runs and the
 * failure inside the application when it cannot finish. Neither is a dialog.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

// #ST1 in docs/e2e-test-cases.md
test('ST1: shows the startup spinner before the application appears', async ({ page }) => {
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
