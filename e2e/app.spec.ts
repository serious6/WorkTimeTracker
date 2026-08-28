import { expect, test, type Page } from '@playwright/test'

function dialog(page: Page) {
  return page.getByRole('dialog')
}

function trackingCard(page: Page) {
  return page.getByRole('region', { name: 'Currently Tracking' })
}

async function createProject(page: Page, name: string) {
  await trackingCard(page).getByRole('button', { name: 'Create project' }).click()
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page)).toBeHidden()
}

async function addEntry(page: Page, project: string, start: string, end: string) {
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: project })
  await dialog(page).getByLabel('Start time').fill(start)
  await dialog(page).getByLabel('End time').fill(end)
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('shows the dashboard with empty states', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByText('Local data')).toBeVisible()
  await expect(page.getByText('Tracked Today', { exact: true })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()
  await expect(page.getByText('Create your first project to start tracking.')).toBeVisible()
})

test('tracks time with the timer and updates the metrics', async ({ page }) => {
  await createProject(page, 'Website Redesign')

  await page.getByRole('button', { name: 'Select a project' }).click()
  await page.getByRole('option', { name: 'Website Redesign' }).click()
  await trackingCard(page).getByRole('button', { name: 'Start timer' }).click()

  await expect(page.getByText('Timer started')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop timer' })).toBeVisible()
  await expect(page.getByLabel('Elapsed time')).toBeVisible()

  await page.getByRole('button', { name: 'Stop timer' }).click()
  await expect(page.getByText('Timer stopped')).toBeVisible()
  await expect(trackingCard(page).getByRole('button', { name: 'Start timer' })).toBeVisible()
})

test('adds, edits and deletes a manual time entry', async ({ page }) => {
  await createProject(page, 'Mobile App')

  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: 'Mobile App' })
  await dialog(page).getByLabel('Start time').fill('09:00')
  await dialog(page).getByLabel('End time').fill('11:30')
  await expect(dialog(page).getByLabel('Duration')).toHaveValue('2h 30m')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()

  await expect(page.getByText('Total: 2h 30m')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Mobile App' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await dialog(page).getByLabel('End time').fill('12:00')
  await dialog(page).getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Entry updated')).toBeVisible()
  await expect(page.getByText('Total: 3h 00m')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Mobile App' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Entry deleted', { exact: true })).toBeVisible()
  await expect(page.getByText('No time tracked today')).toBeVisible()
})

test('rejects overlapping entries and invalid times', async ({ page }) => {
  await createProject(page, 'Research')

  await addEntry(page, 'Research', '09:00', '10:00')
  await expect(dialog(page)).toBeHidden()

  await addEntry(page, 'Research', '11:00', '10:30')
  await expect(page.getByText('End time must be later than start time')).toBeVisible()

  await dialog(page).getByLabel('Start time').fill('09:30')
  await dialog(page).getByLabel('End time').fill('10:30')
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
  await expect(page.getByText('This time overlaps with another time entry')).toBeVisible()
})

test('navigates between days and views', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByText('No time tracked today')).toBeVisible()
  await page.getByRole('button', { name: 'Today' }).click()

  await page.getByRole('button', { name: 'Projects' }).click()
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Work targets' })).toBeVisible()
})
