import { expect, test } from '@playwright/test'
import {
  addEntry,
  createNoteTemplate,
  createProject,
  dialog,
  expectHeading,
  gotoPage,
  startSignedInSession,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// NT1 in docs/e2e-test-cases.md
test('NT1: note templates page supports CRUD with validation and confirm flow', async ({ page }) => {
  await gotoPage(page, 'Note Templates')
  await expect(page.getByText('No note templates yet.')).toBeVisible()

  await createNoteTemplate(page, { name: 'Daily standup', text: 'Daily standup with the team' })
  await expect(page.getByText('Daily standup with the team')).toBeVisible()

  await page.getByRole('button', { name: 'Create template' }).click()
  await dialog(page).getByLabel('Name').fill('Daily standup')
  await dialog(page).getByLabel('Note text').fill('Another text')
  await dialog(page).getByRole('button', { name: 'Create template' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('already exists')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Edit note template Daily standup' }).click()
  await dialog(page).getByLabel('Note text').fill('Standup with the whole team')
  await dialog(page).getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText('Standup with the whole team')).toBeVisible()

  await page.getByRole('button', { name: 'Delete note template Daily standup' }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Daily standup', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Delete note template Daily standup' }).click()
  await dialog(page).getByRole('button', { name: 'Delete template' }).click()
  await expect(page.getByText('No note templates yet.')).toBeVisible()
})

// NT2 in docs/e2e-test-cases.md
test('NT2: an inserted template stays editable and the saved note survives its template', async ({
  page,
}) => {
  await createNoteTemplate(page, { name: 'Daily standup', text: 'Daily standup with the team' })
  await gotoPage(page, 'Dashboard')
  await createProject(page, 'Client Portal')
  await addEntry(page, 'Client Portal', '09:00', '10:00')

  await page.getByRole('button', { name: 'Actions for Client Portal' }).first().click()
  await page.getByRole('menuitem', { name: 'Add note' }).click()
  await dialog(page).getByLabel('Insert note template').selectOption({ label: 'Daily standup' })
  await expect(dialog(page).getByLabel('Note', { exact: true })).toHaveValue(
    'Daily standup with the team',
  )
  await dialog(page)
    .getByLabel('Note', { exact: true })
    .fill('Daily standup with the team, 15 minutes')
  await dialog(page).getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByText('Daily standup with the team, 15 minutes')).toBeVisible()

  await gotoPage(page, 'Note Templates')
  await page.getByRole('button', { name: 'Edit note template Daily standup' }).click()
  await dialog(page).getByLabel('Note text').fill('Standup, 15 minutes, remote')
  await dialog(page).getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText('Standup, 15 minutes, remote')).toBeVisible()

  await page.getByRole('button', { name: 'Delete note template Daily standup' }).click()
  await dialog(page).getByRole('button', { name: 'Delete template' }).click()
  await expect(page.getByText('No note templates yet.')).toBeVisible()

  await gotoPage(page, 'Dashboard')
  await expect(page.getByText('Daily standup with the team, 15 minutes')).toBeVisible()
  await page.getByRole('button', { name: 'Actions for Client Portal' }).first().click()
  await page.getByRole('menuitem', { name: 'Edit note' }).click()
  await expect(dialog(page).getByLabel('Insert note template')).toBeHidden()
  await expect(dialog(page).getByLabel('Note', { exact: true })).toHaveValue(
    'Daily standup with the team, 15 minutes',
  )
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expectHeading(page, 'Dashboard')
})
