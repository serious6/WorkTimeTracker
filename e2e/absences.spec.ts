import { expect, test } from '@playwright/test'
import { dateKey, dialog, expectHeading, gotoPage, markAbsence, register } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')
})

// A1 in docs/e2e-test-cases.md
test('A1: absences page supports CRUD, summary updates and audit trail updates', async ({ page }) => {
  await gotoPage(page, 'Settings')
  await page.getByLabel('Weekly working time (hours)').fill('56')
  await page.getByRole('checkbox', { name: 'Saturday' }).check()
  await page.getByRole('checkbox', { name: 'Sunday' }).check()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: dateKey(1), lastDay: dateKey(2) })
  await expect(page.getByText('Absence saved')).toBeVisible()
  await expect(page.getByText('2 days recorded, 16h 00m of target neutralised.')).toBeVisible()

  await page.getByRole('button', { name: `Edit absence on ${dateKey(1)}` }).click()
  await dialog(page).getByLabel('Absence type').selectOption('halfDay')
  await dialog(page).getByRole('button', { name: 'Save absence' }).click()
  await expect(page.getByText('Absence updated')).toBeVisible()
  await expect(page.getByText('2 days recorded, 12h 00m of target neutralised.')).toBeVisible()

  await page.getByRole('button', { name: `Delete absence on ${dateKey(2)}` }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Vacation', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Delete absence on ${dateKey(2)}` }).click()
  await dialog(page).getByRole('button', { name: 'Delete absence' }).click()
  await expect(page.getByText('Absence deleted')).toBeVisible()
  await expect(page.getByText('1 day recorded, 4h 00m of target neutralised.')).toBeVisible()

  await expect(page.getByText('Created').first()).toBeVisible()
  await expect(page.getByText('Updated').first()).toBeVisible()
  await expect(page.getByText('Deleted').first()).toBeVisible()
  await expect(page.getByText(`Half day on ${dateKey(1)}`)).toBeVisible()
})
