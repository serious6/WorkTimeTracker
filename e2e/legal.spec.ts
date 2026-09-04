import { expect, test } from '@playwright/test'
import { expectHeading, gotoPage, openAccountMenu, startSignedInSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await startSignedInSession(page)
})

// LG1 in docs/e2e-test-cases.md
test('LG1: terms of service and privacy policy are reachable from the account menu', async ({
  page,
}) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Terms of Service' }).click()
  await expectHeading(page, 'Terms of Service')
  await expect(page.getByText(/Version \d+\.\d+, last updated \d{4}-\d{2}-\d{2}\./)).toBeVisible()
  await expect(page.getByRole('heading', { name: '5. No warranty' })).toBeVisible()

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Privacy Policy' }).click()
  await expectHeading(page, 'Privacy Policy')
  await expect(page.getByRole('heading', { name: '2. Where your data is stored' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '5. No tracking, and access by the authors' })).toBeVisible()

  await gotoPage(page, 'Settings')
  await expectHeading(page, 'Settings')
})

// LG2 in docs/e2e-test-cases.md
test('LG2: the legal documents stay reachable and are not restored after a reload', async ({
  page,
}) => {
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Privacy Policy' }).click()
  await expectHeading(page, 'Privacy Policy')

  await page.reload()
  await expectHeading(page, 'Dashboard')

  await gotoPage(page, 'Projects')
  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Terms of Service' }).click()
  await expectHeading(page, 'Terms of Service')
})
