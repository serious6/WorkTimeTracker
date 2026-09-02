import { expect, test } from '@playwright/test'
import { createProject, dateKey, expectHeading, gotoPage, register } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')
})

// W1 in docs/e2e-test-cases.md
test('W1: week navigation updates subtitle and week number', async ({ page }) => {
  await gotoPage(page, 'Week')
  const subtitle = page.getByText(/· KW \d+/)
  const initial = (await subtitle.textContent()) ?? ''

  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(subtitle).toBeVisible()
  await expect(subtitle).not.toHaveText(initial)

  await page.getByRole('button', { name: 'This week' }).click()
  await expect(subtitle).toHaveText(initial)
})

// W2 in docs/e2e-test-cases.md
test('W2: quick add updates day delta, week progress and month overview metrics', async ({ page }) => {
  await createProject(page, 'Week Project')
  await gotoPage(page, 'Week')

  await page.getByLabel('Quick add project').selectOption({ label: 'Week Project' })
  await page.getByLabel('Selected quick-add day').fill(dateKey(0))
  await page.getByRole('button', { name: '15 min' }).click()
  await page.getByRole('button', { name: '1 hour' }).click()
  await page.getByLabel('Quick add custom duration').fill('45m')
  await page.getByRole('button', { name: 'Add' }).first().click()

  await expect(page.getByText('Tracked this week')).toBeVisible()
  await expect(page.getByText('2h 00m', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/[+-]\d+h \d\dm vs target/).first()).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Week progress' })).toBeVisible()

  await expect(page.getByText('Tracked month-to-date')).toBeVisible()
  await expect(page.getByText('2h 00m', { exact: true }).first()).toBeVisible()
})
