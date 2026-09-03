import { expect, test, type Page } from '@playwright/test'
import { createProject, dialog, downloadText, register, trackingCard } from './helpers'

const PROJECT = 'Website Redesign'
const OTHER_PROJECT = 'Mobile App'

/** Today at a fixed hour, so no session of these tests ever crosses midnight. */
function today(hour: number) {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return date
}

/** Human duration such as `2h 31m`, mirroring the format of the application. */
function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${`${minutes % 60}`.padStart(2, '0')}m`
}

/** Stored duration of an entry as the list shows it, such as `02:31:00`. */
function stopwatch(minutes: number) {
  return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}:00`
}

async function startTimer(page: Page, project: string) {
  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: project }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()
}

/** Adds a further project through the picker, once the first project exists. */
async function addProject(page: Page, name: string) {
  await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('button', { name: 'Create project' }).click()
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page)).toBeHidden()
}

async function stopTimer(page: Page) {
  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(trackingCard(page).getByRole('button', { name: 'Start timer' })).toBeVisible()
}

/**
 * The clock ticks while the application starts, so no timer of the page stays
 * pending, and is frozen afterwards. From then on only `clock.fastForward`
 * moves the time, which makes every elapsed session exact to the second.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: today(8) })
  await page.goto('/')
  await register(page, 'first@example.com')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.clock.pauseAt(today(9))
  await createProject(page, PROJECT)
})

const ROUNDING_CASES = [
  { id: 'E1', elapsed: '00:00:10', minutes: 0 },
  { id: 'E2', elapsed: '00:00:29', minutes: 0 },
  { id: 'E3', elapsed: '00:00:30', minutes: 1 },
  { id: 'E4', elapsed: '00:00:59', minutes: 1 },
  { id: 'E5', elapsed: '00:01:10', minutes: 1 },
  { id: 'E6', elapsed: '00:01:30', minutes: 2 },
  { id: 'E7', elapsed: '00:01:59', minutes: 2 },
  { id: 'E8', elapsed: '00:59:45', minutes: 60 },
  { id: 'E9', elapsed: '02:30:30', minutes: 151 },
]

for (const { id, elapsed, minutes } of ROUNDING_CASES) {
  // E1–E9 in docs/e2e-test-cases.md
  test(`${id}: stops a session of ${elapsed} as ${duration(minutes)}`, async ({ page }) => {
    await startTimer(page, PROJECT)
    await page.clock.fastForward(elapsed)
    await expect(page.getByLabel('Elapsed time')).toHaveText(elapsed)

    await page.getByRole('button', { name: 'Stop timer' }).click()

    if (minutes === 0) {
      await expect(page.getByText('Sessions shorter than 30 seconds are not saved')).toBeVisible()
      await expect(page.getByText('No time tracked today')).toBeVisible()
      await expect(page.getByText('Total: 0h 00m')).toBeVisible()
      return
    }

    await expect(page.getByText(`${duration(minutes)} added to ${PROJECT}`)).toBeVisible()
    await expect(page.getByText(`Total: ${duration(minutes)}`)).toBeVisible()
    await expect(page.getByText(stopwatch(minutes))).toBeVisible()
  })
}

// E10 in docs/e2e-test-cases.md
test('E10: sums the segments of a paused session before rounding', async ({ page }) => {
  await startTimer(page, PROJECT)
  await page.clock.fastForward('00:00:40')
  await trackingCard(page).getByRole('button', { name: 'Pause timer' }).click()
  await expect(trackingCard(page).getByRole('button', { name: 'Resume timer' })).toBeVisible()

  await trackingCard(page).getByRole('button', { name: 'Resume timer' }).click()
  await expect(trackingCard(page).getByRole('button', { name: 'Pause timer' })).toBeVisible()
  await page.clock.fastForward('00:00:40')
  await expect(page.getByLabel('Elapsed time')).toHaveText('00:01:20')

  // Rounding each 40s segment on its own would give two minutes, the summed
  // 1m 20s of the session round to one.
  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText(`0h 01m added to ${PROJECT}`)).toBeVisible()
  await expect(page.getByText('Total: 0h 01m')).toBeVisible()
})

// E11 in docs/e2e-test-cases.md
test('E11: rounds the session that is stopped after a project switch', async ({ page }) => {
  await addProject(page, OTHER_PROJECT)
  await startTimer(page, PROJECT)
  await page.clock.fastForward('00:02:00')

  await trackingCard(page).getByRole('button', { name: PROJECT }).click()
  await page.getByRole('option', { name: OTHER_PROJECT }).click()
  await expect(page.getByText(`Switched to ${OTHER_PROJECT}`)).toBeVisible()

  // The switch starts a new session, so only its 1m 30s are rounded up.
  await page.clock.fastForward('00:01:30')
  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText(`0h 02m added to ${OTHER_PROJECT}`)).toBeVisible()
  await expect(page.getByText('Total: 0h 04m')).toBeVisible()
  // The closed segment keeps its two minutes, the stopped one is rounded up to two.
  await expect(page.getByText('00:02:00')).toHaveCount(2)
})

// E12 in docs/e2e-test-cases.md
test('E12: keeps a discarded session out of every total', async ({ page }) => {
  await startTimer(page, PROJECT)
  await page.clock.fastForward('00:00:29')
  await stopTimer(page)

  await expect(page.getByText('No time tracked today')).toBeVisible()
  await expect(page.getByText('Total: 0h 00m')).toBeVisible()

  // The session is over, so the other views may load with a running clock again.
  await page.clock.resume()
  await page.getByRole('button', { name: 'Time Entries' }).click()
  await expect(page.getByText('No time entries yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.getByText('No time tracked this week.')).toBeVisible()
})

// E13 in docs/e2e-test-cases.md
test('E13: shows the rounded duration in every view', async ({ page }) => {
  await startTimer(page, PROJECT)
  await page.clock.fastForward('02:30:30')
  await stopTimer(page)
  await expect(page.getByText('Total: 2h 31m')).toBeVisible()

  // The session is stored, so the other views may load with a running clock again.
  await page.clock.resume()
  await page.getByRole('button', { name: 'Time Entries' }).click()
  await expect(page.getByText('Total: 2h 31m')).toBeVisible()
  await expect(page.getByText('02:31:00')).toBeVisible()

  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.getByText('Total: 2h 31m')).toBeVisible()
  await expect(page.getByText('2h 31m (100%)')).toBeVisible()

  // The monthly record carries the same value into the CSV and PDF export.
  await page.getByRole('button', { name: 'Working Time' }).click()
  await expect(page.getByRole('cell', { name: '2h 31m' })).toBeVisible()

  expect(await downloadText(page, 'Export CSV')).toContain('02:31')
  expect(await downloadText(page, 'Export PDF')).toContain('02:31')
})

// E14 in docs/e2e-test-cases.md
test('E14: keeps the rounded duration after a reload', async ({ page }) => {
  await startTimer(page, PROJECT)
  await page.clock.fastForward('00:01:30')
  await stopTimer(page)
  await expect(page.getByText('Total: 0h 02m')).toBeVisible()

  // The session is stored, so the reload may run with a running clock again.
  await page.clock.resume()
  await page.reload()

  await expect(page.getByText('Total: 0h 02m')).toBeVisible()
  await expect(page.getByText('00:02:00')).toBeVisible()
})
