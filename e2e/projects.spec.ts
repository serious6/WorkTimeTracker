import { expect, test } from '@playwright/test'
import { addEntry, createProject, dialog, expectHeading, gotoPage, startSignedInSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// P1 in docs/e2e-test-cases.md
test('P1: projects page supports CRUD with confirm flow and project total', async ({ page }) => {
  await createProject(page, 'Client Portal')
  await addEntry(page, 'Client Portal', '09:00', '11:00')
  await gotoPage(page, 'Projects')

  await expect(page.getByText('Client Portal', { exact: true }).first()).toBeVisible()
  await expect(
    page.locator('li').filter({ hasText: 'Client Portal' }).getByText('2h 00m', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Edit Client Portal' }).click()
  await dialog(page).getByLabel('Name').fill('Client Portal v2')
  await dialog(page).getByLabel('Description').fill('Main customer project')
  await dialog(page).getByRole('button', { name: 'Color #3b82f6' }).click()
  await dialog(page).getByRole('button', { name: 'Save project' }).click()
  await expect(page.getByText('Project updated')).toBeVisible()
  await expect(page.getByText('Client Portal v2', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Main customer project', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Delete Client Portal v2' }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Client Portal v2', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Delete Client Portal v2' }).click()
  await dialog(page).getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('Project deleted')).toBeVisible()
  await expect(page.getByText('Create your first project to start tracking time.')).toBeVisible()
})

// P2 in docs/e2e-test-cases.md
test('P2: deleted project entries stay usable and project links open filtered entries', async ({ page }) => {
  await createProject(page, 'Cleanup Project')
  await addEntry(page, 'Cleanup Project', '08:00', '09:00')

  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Cleanup Project', exact: true }).first().click()
  await expectHeading(page, 'Time Entries')
  await expect(
    page
      .locator('li')
      .filter({ hasText: 'Cleanup Project' })
      .getByText('8:00 AM – 9:00 AM', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()

  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Delete Cleanup Project' }).click()
  await dialog(page).getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('Project deleted')).toBeVisible()

  await gotoPage(page, 'Time Entries')
  await expect(page.getByText('Deleted project', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()
})

// P3 in docs/e2e-test-cases.md
test('P3: audit trails list the registration and every project change', async ({ page }) => {
  await createProject(page, 'Trail Project')
  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Edit Trail Project' }).click()
  await dialog(page).getByLabel('Name').fill('Trail Project v2')
  await dialog(page).getByRole('button', { name: 'Save project' }).click()
  await expect(page.getByText('Project updated')).toBeVisible()
  await page.getByRole('button', { name: 'Delete Trail Project v2' }).click()
  await dialog(page).getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('Project deleted')).toBeVisible()

  await gotoPage(page, 'Audit Trails')
  const records = page.getByTestId('audit-records').getByRole('listitem')

  const registration = records.filter({ hasText: 'Account created' })
  await expect(registration).toHaveCount(1)
  await expect(registration).toContainText('Identity')
  await expect(registration).toContainText('first@example.com')

  // The project row is gone, yet its trail still names the project.
  await expect(records.filter({ hasText: 'Project Trail Project v2' })).toHaveCount(2)
  await expect(records.filter({ hasText: 'Project Trail Project' }).first()).toContainText(
    'Deleted',
  )
  await expect(page.getByText('Name: Trail Project → Trail Project v2')).toHaveCount(1)

  // A successful sign in is deliberately not recorded.
  await expect(records.filter({ hasText: 'Sign in' })).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Identity' }).check()
  await expect(records).toHaveCount(1)
  await expect(records.first()).toContainText('Registered')
})
