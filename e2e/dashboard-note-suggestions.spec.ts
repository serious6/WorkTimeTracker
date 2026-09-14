import { expect, test } from '@playwright/test'
import { createProject, gotoPage, startSignedInSession, trackingCard } from './helpers'

async function startTimer(page: Parameters<typeof createProject>[0], project: string) {
  await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: project }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(trackingCard(page).getByRole('button', { name: 'Stop timer' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const running = new Date(start)
  running.setHours(9, 0, 0, 0)
  await page.clock.install({ time: start })
  await startSignedInSession(page)
  await page.clock.pauseAt(running)
  await createProject(page, 'Client Portal')
})

// X6 in docs/e2e-test-cases.md
test('X6: currently tracking note suggestions can be selected and saved', async ({ page }) => {
  await startTimer(page, 'Client Portal')
  const note = trackingCard(page).getByRole('combobox', { name: 'Add a note' })
  await note.fill('Daily standup sync')
  await note.blur()
  await page.clock.fastForward('00:00:30')
  await trackingCard(page).getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText('0h 01m added to Client Portal')).toBeVisible()

  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(trackingCard(page).getByRole('button', { name: 'Stop timer' })).toBeVisible()

  await note.fill('dai')
  const suggestion = trackingCard(page).getByRole('option', { name: 'Daily standup sync' })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(note).toHaveValue('Daily standup sync')
  await expect(trackingCard(page).getByRole('listbox')).toHaveCount(0)

  await page.clock.fastForward('00:00:30')
  await trackingCard(page).getByRole('button', { name: 'Stop timer' }).click()
  await page.clock.resume()
  await gotoPage(page, 'Time Entries')
  await expect(page.locator('main').getByText('Daily standup sync').first()).toBeVisible()
})
