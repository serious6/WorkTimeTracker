import { expect, type Page } from '@playwright/test'

export function dialog(page: Page) {
  return page.getByRole('dialog')
}

export function trackingCard(page: Page) {
  return page.getByRole('region', { name: 'Currently Tracking' })
}

export function dateKey(inDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + inDays)
  return date.toISOString().slice(0, 10)
}

export async function createProject(page: Page, name: string) {
  await trackingCard(page).getByRole('button', { name: 'Create project' }).click()
  await dialog(page).getByLabel('Name').fill(name)
  await dialog(page).getByRole('button', { name: 'Create project' }).click()
  await expect(dialog(page)).toBeHidden()
}

export async function addEntry(page: Page, project: string, start: string, end: string) {
  await page.getByRole('button', { name: 'Add time entry' }).click()
  await dialog(page).getByLabel('Project').selectOption({ label: project })
  await dialog(page).getByLabel('Start time').fill(start)
  await dialog(page).getByLabel('End time').fill(end)
  await dialog(page).getByRole('button', { name: 'Add entry' }).click()
}

export const PASSWORD = 'Str0ng-Passphrase!!x'

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
}

export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click()
}
