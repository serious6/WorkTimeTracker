import { expect, test, type Page } from '@playwright/test'
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
  openAccountMenu,
  register,
} from './helpers'

const USER = 'first@example.com'
const AUDIT_DAY = '2026-03-15'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, USER)
  await expectHeading(page, 'Dashboard')
})

function auditRows(page: Page) {
  return page.getByRole('listitem').filter({ hasText: USER })
}

function auditRecord(page: Page, ...texts: string[]) {
  return texts.reduce((rows, text) => rows.filter({ hasText: text }), auditRows(page))
}

async function seedEveryTrail(page: Page, project = 'Audit Project') {
  await createProject(page, project)
  await addEntry(page, project, '09:00', '10:00')
  await expect(page.getByText('1h 00m added')).toBeVisible()

  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: dateKey(0) })
  await expect(page.getByText('Absence saved')).toBeVisible()

  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'adjustment', overtime: '30m', effectiveDate: dateKey(0) })
  await expect(page.getByText('Overtime saved')).toBeVisible()
}

async function expectOnlyTypes(page: Page, visibleTypes: string[]) {
  for (const type of ['Time Entry', 'Absence', 'Overtime']) {
    await expect(auditRecord(page, type)).toHaveCount(visibleTypes.includes(type) ? 1 : 0)
  }
}

// AT1 in docs/e2e-test-cases.md
test('AT1: Audit group opens Audit Trails with the current page marker', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const manage = nav.getByRole('heading', { name: 'Manage', level: 2 })
  const audit = nav.getByRole('heading', { name: 'Audit', level: 2 })
  const settings = nav.getByRole('button', { name: 'Settings' })

  const [manageBox, auditBox, settingsBox] = await Promise.all([
    manage.boundingBox(),
    audit.boundingBox(),
    settings.boundingBox(),
  ])
  expect(manageBox?.y).toBeLessThan(auditBox?.y ?? 0)
  expect(auditBox?.y).toBeLessThan(settingsBox?.y ?? 0)

  await nav.getByRole('button', { name: 'Audit Trails' }).click()

  await expectHeading(page, 'Audit Trails')
  await expect(nav.getByRole('button', { name: 'Audit Trails' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

// AT2 in docs/e2e-test-cases.md
test('AT2: merged trails list time entries, absences and overtime newest first', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(`${AUDIT_DAY}T09:00:00`) })
  await createProject(page, 'Merged Audit Project')
  await addEntry(page, 'Merged Audit Project', '09:00', '10:00')
  await page.clock.fastForward(1_000)

  await gotoPage(page, 'Absences')
  await markAbsence(page, { type: 'vacation', firstDay: AUDIT_DAY })
  await page.clock.fastForward(1_000)

  await gotoPage(page, 'Overtime')
  await addOvertime(page, { kind: 'adjustment', overtime: '30m', effectiveDate: AUDIT_DAY })

  await gotoPage(page, 'Audit Trails')
  await expect(page.getByText('3 records in the selected period.')).toBeVisible()

  const rows = await auditRows(page).allTextContents()
  expect(rows).toHaveLength(3)
  expect(rows[0]).toContain('Overtime')
  expect(rows[1]).toContain('Absence')
  expect(rows[2]).toContain('Time Entry')
  for (const row of rows) {
    expect(row).toContain('Created')
    expect(row).toContain(USER)
    expect(row).toMatch(/· .* \d{1,2}:\d{2} (AM|PM)/)
  }
})

// AT3 in docs/e2e-test-cases.md
test('AT3: type filters support single, combined and all-type selections', async ({ page }) => {
  await seedEveryTrail(page)
  await gotoPage(page, 'Audit Trails')
  await expect(page.getByText('3 records in the selected period.')).toBeVisible()

  for (const type of ['Time Entry', 'Absence', 'Overtime']) {
    await page.getByRole('checkbox', { name: type }).check()
    await expect(page.getByText('1 record in the selected period.')).toBeVisible()
    await expectOnlyTypes(page, [type])
    await page.getByRole('checkbox', { name: type }).uncheck()
  }

  await page.getByRole('checkbox', { name: 'Absence' }).check()
  await page.getByRole('checkbox', { name: 'Overtime' }).check()
  await expect(page.getByText('2 records in the selected period.')).toBeVisible()
  await expectOnlyTypes(page, ['Absence', 'Overtime'])

  await page.getByRole('checkbox', { name: 'Absence' }).uncheck()
  await page.getByRole('checkbox', { name: 'Overtime' }).uncheck()
  await expect(page.getByText('3 records in the selected period.')).toBeVisible()
})

// AT4 in docs/e2e-test-cases.md
test('AT4: period filters evaluate aged records without waiting for real time', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(`${AUDIT_DAY}T09:00:00`) })
  await createProject(page, 'Aged Audit Project')
  await addEntry(page, 'Aged Audit Project', '09:00', '10:00')

  await page.clock.fastForward(10 * 24 * 60 * 60 * 1_000)
  await page.reload()
  await login(page, USER)
  await expectHeading(page, 'Dashboard')
  await gotoPage(page, 'Audit Trails')
  await expect(page.getByLabel('Period')).toHaveValue('last7')
  await expect(page.getByText('No audit records for the selected filters.')).toBeVisible()

  for (const option of ['Today', 'Last 3 days', 'Last 7 days']) {
    await page.getByLabel('Period').selectOption({ label: option })
    await expect(page.getByText('No audit records for the selected filters.')).toBeVisible()
  }

  for (const option of ['Last 14 days', 'Last month', 'Always']) {
    await page.getByLabel('Period').selectOption({ label: option })
    await expect(auditRecord(page, 'Time Entry', 'Created')).toBeVisible()
  }
})

// AT5 in docs/e2e-test-cases.md
test('AT5: editing and deleting a record creates action rows with changed fields', async ({
  page,
}) => {
  await createProject(page, 'Actions Audit Project')
  await addEntry(page, 'Actions Audit Project', '09:00', '10:00')

  await gotoPage(page, 'Time Entries')
  await page.getByRole('button', { name: 'Actions for Actions Audit Project' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await dialog(page).getByLabel('End time').fill('11:00')
  await dialog(page).getByRole('button', { name: 'Save entry' }).click()
  await expect(page.getByText('Entry updated')).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Actions Audit Project' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await dialog(page).getByRole('button', { name: 'Delete entry' }).click()
  await expect(page.getByText('Entry deleted', { exact: true })).toBeVisible()

  await gotoPage(page, 'Audit Trails')
  const edited = auditRecord(page, 'Time Entry', 'Edited')
  await expect(edited).toContainText('End:')
  await expect(edited).toContainText('10:00')
  await expect(edited).toContainText('11:00')
  await expect(auditRecord(page, 'Time Entry', 'Deleted')).toBeVisible()
})

// AT6 in docs/e2e-test-cases.md
test('AT6: unmatched filter combinations show the empty callout', async ({ page }) => {
  await createProject(page, 'Empty Filter Project')
  await addEntry(page, 'Empty Filter Project', '09:00', '10:00')

  await gotoPage(page, 'Audit Trails')
  await page.getByRole('checkbox', { name: 'Absence' }).check()

  await expect(page.getByText('No audit records for the selected filters.')).toBeVisible()
})

// AT7 in docs/e2e-test-cases.md
test('AT7: Audit Trails is read-only and exposes no write controls', async ({ page }) => {
  await seedEveryTrail(page)
  await gotoPage(page, 'Audit Trails')

  await expect(
    page.getByRole('main').getByRole('button', { name: /create|add|edit|delete|save/i }),
  ).toHaveCount(0)
})

// AT8 in docs/e2e-test-cases.md
test('AT8: audit records stay isolated after switching users', async ({ page }) => {
  await seedEveryTrail(page, 'User A Audit Project')

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Switch User' }).click()
  await register(page, 'second@example.com')
  await expectHeading(page, 'Dashboard')

  await gotoPage(page, 'Audit Trails')
  await expect(page.getByText('No audit records for the selected filters.')).toBeVisible()
  await expect(auditRows(page)).toHaveCount(0)
})
