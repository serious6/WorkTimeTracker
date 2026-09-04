import { expect, test } from '@playwright/test'
import {
  addEntry,
  addOvertime,
  createBudget,
  createProject,
  dateKey,
  dialog,
  downloadText,
  expectHeading,
  gotoPage,
  login,
  markAbsence,
  openAccountMenu,
  register,
  trackingCard,
  startSignedInSession,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// X1 in docs/e2e-test-cases.md
test('X1: project, entries, absence and settings persist across reload while staying signed in', async ({
  page,
}) => {
  await createProject(page, 'Persistent Project')
  await addEntry(page, 'Persistent Project', '09:00', '10:30')

  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'sick', firstDay: dateKey(1) })
  await expect(page.getByText('Absence saved')).toBeVisible()

  await gotoPage(page, 'Settings')
  await page.getByLabel('Weekly working time (hours)').fill('35')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await page.reload()
  await expectHeading(page, 'Dashboard')
  await expect(page.getByText('first@example.com')).toBeVisible()
  await gotoPage(page, 'Settings')
  await expect(page.getByLabel('Weekly working time (hours)')).toHaveValue('35')

  await gotoPage(page, 'Projects')
  await expect(page.getByText('Persistent Project')).toBeVisible()
  await gotoPage(page, 'Time Entries')
  await expect(page.getByText('Total: 1h 30m')).toBeVisible()
  await gotoPage(page, 'Absences')
  await expect(page.getByText('1 day recorded')).toBeVisible()
})

// X2 in docs/e2e-test-cases.md
test('X2: absences, overtime, budgets and settings stay isolated per user', async ({ page }) => {
  await createProject(page, 'User A Project')
  await addEntry(page, 'User A Project', '09:00', '10:00')

  await gotoPage(page, 'Budgets')
  await createBudget(page, { project: 'User A Project', budgetHours: '4', dueDate: dateKey(30) })
  await expect(page.getByText('Budget created')).toBeVisible()

  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: dateKey(1) })
  await expect(page.getByText('Absence saved')).toBeVisible()

  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'opening', overtime: '1h 00m' })
  await expect(page.getByText('Overtime saved')).toBeVisible()

  await gotoPage(page, 'Settings')
  await page.getByLabel('Weekly working time (hours)').fill('30')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await register(page, 'second@example.com')
  await expectHeading(page, 'Dashboard')

  await gotoPage(page, 'Budgets')
  await expect(page.getByText('Create a project first to define a budget for it.')).toBeVisible()
  await gotoPage(page, 'Absences')
  await expect(page.getByText('No absences yet.')).toBeVisible()
  await gotoPage(page, 'Overtime')
  await expect(page.getByText('No explicit overtime yet.')).toBeVisible()
  await gotoPage(page, 'Settings')
  await expect(page.getByLabel('Weekly working time (hours)')).toHaveValue('40')

  // The record ids of an account start over, so this project carries the id of
  // user A's project: deleting it must not reach the other account.
  await createProject(page, 'User B Project')
  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Delete User B Project' }).click()
  await dialog(page).getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('Project deleted')).toBeVisible()

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await login(page, 'first@example.com')
  await gotoPage(page, 'Projects')
  await expect(page.getByText('User A Project', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Budgets')
  await expect(page.getByText('User A Project', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Absences')
  await expect(page.getByText('Vacation', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Overtime')
  await expect(page.getByText('Opening balance', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Settings')
  await expect(page.getByLabel('Weekly working time (hours)')).toHaveValue('30')
})

// X3 in docs/e2e-test-cases.md
test('X3: pausing and resuming from the entry list continues the running timer', async ({ page }) => {
  await createProject(page, 'Flow Project')
  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Flow Project' }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()
  await expect(page.getByText('Timer started')).toBeVisible()

  await gotoPage(page, 'Time Entries')
  await page.getByRole('button', { name: 'Pause timer' }).click()
  await expect(page.getByText('Timer paused')).toBeVisible()
  await page.getByRole('button', { name: 'Start timer for Flow Project' }).click()
  await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()
  await expect(page.getByLabel('Elapsed time')).toBeVisible()
})

// X4 in docs/e2e-test-cases.md
test('X4: monthly exports include tracked rows in CSV and PDF', async ({ page }) => {
  await createProject(page, 'Export Project')
  await addEntry(page, 'Export Project', '09:00', '11:30')
  await gotoPage(page, 'Working Time')

  expect(await downloadText(page, 'Export CSV')).toContain('02:30')
  expect(await downloadText(page, 'Export PDF')).toContain('02:30')
})

// X5 in docs/e2e-test-cases.md
test('X5: empty-state pages stay stable and switch to first values after data creation', async ({ page }) => {
  await gotoPage(page, 'Calendar')
  await expect(page.getByText('Tracked time per day')).toBeVisible()

  await gotoPage(page, 'Week')
  await expect(page.getByText('No tracked projects this week.')).toBeVisible()

  await gotoPage(page, 'Budgets')
  await expect(page.getByText('Create a project first to define a budget for it.')).toBeVisible()

  await gotoPage(page, 'Absences')
  await expect(page.getByText('No absences yet.')).toBeVisible()

  await gotoPage(page, 'Overtime')
  await expect(page.getByText('No explicit overtime yet.')).toBeVisible()

  await gotoPage(page, 'Reports')
  await expect(page.getByText('No time tracked this week.')).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await createProject(page, 'First Value Project')
  await addEntry(page, 'First Value Project', '10:00', '11:00')
  await gotoPage(page, 'Budgets')
  await createBudget(page, { project: 'First Value Project', budgetHours: '2', dueDate: dateKey(30) })
  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'halfDay', firstDay: dateKey(1) })
  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'adjustment', overtime: '30m' })

  await gotoPage(page, 'Calendar')
  await expect(page.getByRole('button').filter({ hasText: '1h 00m' })).toHaveCount(1)
  await gotoPage(page, 'Week')
  await expect(page.getByText('First Value Project', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Budgets')
  await expect(page.getByText('First Value Project', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Absences')
  await expect(page.getByText('Half day', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Overtime')
  await expect(page.getByText('Adjustment', { exact: true }).first()).toBeVisible()
  await gotoPage(page, 'Reports')
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()
})
