import { expect, test } from '@playwright/test'
import {
  addEntry,
  createBudget,
  createProject,
  dateKey,
  dialog,
  expectHeading,
  gotoPage,
  register,
  trackingCard,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')
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

// P4 in docs/e2e-test-cases.md
test('P4: an archived project leaves the tracking selections and can be restored', async ({
  page,
}) => {
  await createProject(page, 'Archive Me')
  await createProject(page, 'Still Active')
  await addEntry(page, 'Archive Me', '09:00', '10:00')

  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Archive Archive Me' }).click()
  await expect(page.getByText('Project archived')).toBeVisible()
  await expect(
    page.locator('li').filter({ hasText: 'Archive Me' }).getByText('Archived', { exact: true }),
  ).toBeVisible()
  // The tracked hour of the archived project is still reported.
  await expect(
    page.locator('li').filter({ hasText: 'Archive Me' }).getByText('1h 00m', { exact: true }),
  ).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
  await expect(page.getByRole('option', { name: 'Still Active' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Archive Me' })).toBeHidden()
  await page.keyboard.press('Escape')

  // The entry dialog offers the archived project no more, the entry stays.
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await expect(dialog(page).getByLabel('Project').getByRole('option', { name: 'Archive Me' })).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()

  await gotoPage(page, 'Time Entries')
  await expect(page.locator('li').filter({ hasText: 'Archive Me' }).first()).toBeVisible()
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()
  // The entry stays, but it cannot start a new timer on the archived project.
  await expect(page.getByRole('button', { name: 'Start timer for Archive Me' }).first()).toBeDisabled()

  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Unarchive Archive Me' }).click()
  await expect(page.getByText('Project restored')).toBeVisible()
  await expect(page.getByText('Archived', { exact: true })).toBeHidden()

  await gotoPage(page, 'Dashboard')
  await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
  await expect(page.getByRole('option', { name: 'Archive Me' })).toBeVisible()
})

// P5 in docs/e2e-test-cases.md
test('P5: an overdue budget warns during tracking without blocking it', async ({ page }) => {
  await createProject(page, 'Overdue Project')
  await createProject(page, 'Healthy Project')
  // On the previous day, so the timer started below never overlaps this entry.
  await addEntry(page, 'Overdue Project', '09:00', '09:30', dateKey(-1))

  await gotoPage(page, 'Budgets')
  await createBudget(page, { project: 'Overdue Project', budgetHours: '0.25', dueDate: dateKey(30) })
  await expect(page.getByText('Budget created', { exact: true }).first()).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await trackingCard(page).getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Healthy Project' }).click()
  await expect(trackingCard(page).getByRole('status')).toBeHidden()

  await trackingCard(page).getByRole('button', { name: 'Healthy Project' }).click()
  await page.getByRole('option', { name: 'Overdue Project' }).click()
  const warning = trackingCard(page).getByRole('status').filter({ hasText: 'Budget overdue' })
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('exceeded by 0h 15m')

  // The warning informs only: the timer still starts and keeps warning.
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(trackingCard(page).getByLabel('Elapsed time')).toBeVisible()
  await expect(
    trackingCard(page).getByRole('status').filter({ hasText: 'Budget overdue' }),
  ).toBeVisible()
  await trackingCard(page).getByRole('button', { name: 'Stop timer' }).click()
})
