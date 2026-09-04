import { expect, test } from '@playwright/test'
import {
  addEntry,
  addOvertime,
  createProject,
  dateKey,
  dialog,
  expectHeading,
  gotoPage,
  login,
  markAbsence,
  register,
} from './helpers'

const USER = 'first@example.com'
const PROJECT = 'Erasure Project'

/** Opens the danger zone dialog of the settings page. */
async function openDeleteDialog(page: import('@playwright/test').Page) {
  await gotoPage(page, 'Settings')
  await page.getByRole('button', { name: 'Delete account' }).click()
  return dialog(page)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, USER)
  await expectHeading(page, 'Dashboard')
})

// AD1 in docs/e2e-test-cases.md
test('AD1: deleting the account erases its data and all of its audit trails', async ({ page }) => {
  await createProject(page, PROJECT)
  await addEntry(page, PROJECT, '09:00', '10:00')
  await expect(page.getByText('1h 00m added')).toBeVisible()
  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: dateKey(0) })
  await expect(page.getByText('Absence saved')).toBeVisible()
  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'adjustment', overtime: '30m', effectiveDate: dateKey(0) })
  await expect(page.getByText('Overtime saved')).toBeVisible()
  await gotoPage(page, 'Audit Trails')
  await expect(page.getByText('5 records in the selected period.')).toBeVisible()

  const confirmation = await openDeleteDialog(page)
  const confirm = confirmation.getByRole('button', { name: 'Delete account' })
  await expect(confirm).toBeDisabled()
  await confirmation.getByLabel(`Type ${USER} to confirm`).fill(USER)
  await confirm.click()

  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  await expect(page.getByText('Account deleted')).toBeVisible()

  // The credentials of the erased account open nothing any more.
  await login(page, USER)
  await expect(page.getByText('Email or password is incorrect')).toBeVisible()

  // The strongest evidence that no trail survived: the same address starts an
  // empty account whose only record is its own registration.
  await register(page, USER)
  await expectHeading(page, 'Dashboard')
  await gotoPage(page, 'Projects')
  await expect(page.getByText('Create your first project to start tracking time.')).toBeVisible()
  await gotoPage(page, 'Audit Trails')
  await expect(page.getByText('1 record in the selected period.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: PROJECT })).toHaveCount(0)
})

// AD2 in docs/e2e-test-cases.md
test('AD2: a cancelled confirmation deletes nothing', async ({ page }) => {
  await createProject(page, PROJECT)

  const confirmation = await openDeleteDialog(page)
  await confirmation.getByLabel(`Type ${USER} to confirm`).fill(USER)
  await confirmation.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toBeHidden()

  await gotoPage(page, 'Projects')
  await expect(page.getByRole('listitem').filter({ hasText: PROJECT })).toHaveCount(1)
})
