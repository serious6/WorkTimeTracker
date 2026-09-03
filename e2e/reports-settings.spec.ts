import { expect, test } from '@playwright/test'
import { addEntry, createBudget, createProject, dateKey, expectHeading, gotoPage, register } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')
})

// R1 in docs/e2e-test-cases.md
test('R1: reports react to tracked time and budget project selection', async ({ page }) => {
  await createProject(page, 'Report A')
  await createProject(page, 'Report B')
  await addEntry(page, 'Report A', '09:00', '10:00')

  await gotoPage(page, 'Budgets')
  await createBudget(page, { project: 'Report A', budgetHours: '2', dueDate: dateKey(30) })
  await expect(page.getByText('Budget created', { exact: true }).first()).toBeVisible()
  await createBudget(page, { project: 'Report B', budgetHours: '4', dueDate: dateKey(30) })
  await expect(page.getByText('Budget created', { exact: true }).first()).toBeVisible()

  await gotoPage(page, 'Reports')
  await expect(page.getByText('Total: 1h 00m')).toBeVisible()
  await expect(page.getByText(/Target:/)).toBeVisible()

  await page.getByLabel('Budget project').selectOption({ label: 'Report A' })
  await expect(page.getByRole('progressbar', { name: 'Budget consumption' })).toBeVisible()
  await expect(page.getByText('50%', { exact: true })).toBeVisible()
  await expect(page.getByText('Forecast')).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await addEntry(page, 'Report A', '10:00', '11:00')
  await gotoPage(page, 'Reports')
  await expect(page.getByText('Total: 2h 00m')).toBeVisible()

  await page.getByLabel('Budget project').selectOption({ label: 'Report B' })
  await expect(page.getByText('0h 00m', { exact: true }).first()).toBeVisible()
})

// R2 in docs/e2e-test-cases.md
test('R2: opening reports after using a project link keeps that project pre-selected', async ({
  page,
}) => {
  await createProject(page, 'Linked Project')
  await gotoPage(page, 'Budgets')
  await createBudget(page, { project: 'Linked Project', budgetHours: '4', dueDate: dateKey(30) })
  await expect(page.getByText('Budget created', { exact: true }).first()).toBeVisible()

  await gotoPage(page, 'Projects')
  await page.getByRole('button', { name: 'Linked Project', exact: true }).first().click()
  await expectHeading(page, 'Time Entries')
  const selectedProjectId = await page.getByLabel('Filter by project').inputValue()
  await expect(selectedProjectId).not.toBe('')

  await gotoPage(page, 'Reports')
  await expect(page.getByLabel('Budget project')).toHaveValue(selectedProjectId)
})

// S1 in docs/e2e-test-cases.md
test('S1: week start and compliance validations are enforced and settings survive reload', async ({
  page,
}) => {
  await gotoPage(page, 'Reports')
  const weekRangeBefore = (await page.getByText(/Week of /).textContent()) ?? ''

  await gotoPage(page, 'Settings')
  await page.getByLabel('Week starts on').selectOption('sunday')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await gotoPage(page, 'Week')
  await expect(page.getByText(/KW \d+/)).toBeVisible()
  await expect(page.getByText(/^Sun,/).first()).toBeVisible()

  await gotoPage(page, 'Calendar')
  await expect(page.getByText('Sun')).toBeVisible()

  await gotoPage(page, 'Reports')
  const weekRangeAfter = (await page.getByText(/Week of /).textContent()) ?? ''
  expect(weekRangeAfter).not.toBe(weekRangeBefore)

  await gotoPage(page, 'Settings')
  await page.getByLabel(/Break required after/).first().fill('600')
  await page.getByLabel(/Longer break required after/).first().fill('500')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(
    page.getByText('The long break threshold and duration must not be below the short ones'),
  ).toBeVisible()
  await expect(page.getByText('Settings saved')).toBeHidden()

  await page.getByLabel(/Break required after/).first().fill('360')
  await page.getByLabel(/Longer break required after/).first().fill('540')
  await page.getByLabel(/Required break/).first().fill('')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Enter working time limits between 1 minute and 24 hours')).toBeVisible()

  await page.getByLabel(/Required break/).first().fill('30')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await page.reload()
  await gotoPage(page, 'Settings')
  await expect(page.getByLabel('Week starts on')).toHaveValue('sunday')
  await expect(page.getByLabel(/Required break/).first()).toHaveValue('30')
})
