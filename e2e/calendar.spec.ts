import { expect, test } from '@playwright/test'
import { addEntry, createProject, dateKey, expectHeading, gotoPage, markAbsence, startSignedInSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// C1 in docs/e2e-test-cases.md
test('C1: calendar shows six-week grid, tracked/absence days and opens the filtered day list', async ({
  page,
}) => {
  await createProject(page, 'Calendar Project')
  await addEntry(page, 'Calendar Project', '09:00', '10:00')
  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: dateKey(0) })
  await expect(page.getByText('Absence saved')).toBeVisible()

  await gotoPage(page, 'Calendar')
  await expect(page.getByText('Tracked time per day')).toBeVisible()
  await expect(page.getByRole('button').filter({ hasText: '1h 00m' })).toHaveCount(1)
  await expect(page.getByRole('button').filter({ hasText: 'Vacation' })).toHaveCount(1)

  const calendarDays = page.locator('button.p-2.text-left.text-xs')
  await expect(calendarDays).toHaveCount(42)
  expect(await page.locator('button.opacity-40').count()).toBeGreaterThan(0)

  await page.getByRole('button').filter({ hasText: '1h 00m' }).click()
  await expectHeading(page, 'Time Entries')
  await expect(page.getByText('Tracked time for')).toBeVisible()
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()
  await expect(
    page
      .locator('li')
      .filter({ hasText: 'Calendar Project' })
      .getByText('9:00 AM – 10:00 AM', { exact: true }),
  ).toBeVisible()
})
