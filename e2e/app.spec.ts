import { expect, test } from '@playwright/test'

test('shows the local-first work entry dashboard', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'WorkTimeTracker' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add work entry' })).toBeVisible()
  await expect(page.getByText('Add an entry to see your weekly chart.')).toBeVisible()

  await page.getByLabel('Project').fill('Documentation')
  await page.getByLabel('Minutes').fill('45')
  await page.getByRole('button', { name: 'Save entry' }).click()

  await expect(page.getByText('Add an entry to see your weekly chart.')).toBeHidden()
})
