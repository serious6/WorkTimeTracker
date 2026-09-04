import { expect, test, type Page } from '@playwright/test'
import { addEntry, addOvertime, createProject, dateKey, dialog, gotoPage, startSignedInSession } from './helpers'

function cumulativeBalance(page: Page) {
  return page.getByRole('button').filter({ hasText: 'Carried into this day' }).locator('p').first()
}

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// O1 in docs/e2e-test-cases.md
test('O1: overtime origin filter, audit trail and cross-page balance stay consistent', async ({ page }) => {
  await gotoPage(page, 'Settings')
  await page.getByLabel('Weekly working time (hours)').fill('42')
  await page.getByRole('checkbox', { name: 'Saturday' }).check()
  await page.getByRole('checkbox', { name: 'Sunday' }).check()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await createProject(page, 'Overtime Baseline')
  await addEntry(page, 'Overtime Baseline', '08:00', '14:00')
  await expect(cumulativeBalance(page)).toHaveText('+0h 00m')

  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'opening', overtime: '2h 00m', effectiveDate: dateKey(0), note: 'Import' })
  await expect(page.getByText('Overtime saved')).toBeVisible()

  await page.getByRole('combobox', { name: 'Filter by origin' }).selectOption('automatic')
  await expect(page.getByText('No record with this origin.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Filter by origin' }).selectOption('manual')
  await expect(page.getByText('Opening balance', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: `Edit overtime on ${dateKey(0)}` }).click()
  await dialog(page).getByLabel('Overtime', { exact: true }).fill('3h 00m')
  await dialog(page).getByRole('button', { name: 'Save overtime' }).click()
  await expect(page.getByText('Overtime updated')).toBeVisible()
  await expect(page.getByText('+3h 00m').first()).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await expect(cumulativeBalance(page)).toHaveText('+3h 00m')
  await gotoPage(page, 'Reports')
  await expect(page.getByText(/Balance: \+3h 00m/)).toBeVisible()

  await gotoPage(page, 'Overtime')
  await page.getByRole('button', { name: `Delete overtime on ${dateKey(0)}` }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Opening balance', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: `Delete overtime on ${dateKey(0)}` }).click()
  await dialog(page).getByRole('button', { name: 'Delete record' }).click()
  await expect(page.getByText('Overtime deleted')).toBeVisible()

  await expect(page.getByText('Created').first()).toBeVisible()
  await expect(page.getByText('Updated').first()).toBeVisible()
  await expect(page.getByText('Deleted').first()).toBeVisible()
})
