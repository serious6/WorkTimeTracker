import { expect, test } from '@playwright/test'
import { expectHeading, gotoPage, openAccountMenu, register } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')
})

// L1 in docs/e2e-test-cases.md
test('L1: licenses page is reachable and expands package notices with license text', async ({ page }) => {
  await gotoPage(page, 'Settings')
  await expect(page.getByText('Build with ❤️ in Hamburg')).toBeVisible()

  await openAccountMenu(page)
  await page.getByRole('menuitem', { name: 'Third-Party Licenses' }).click()
  await expectHeading(page, 'Third-Party Licenses')
  await expect(page.getByRole('heading', { name: /npm packages \(\d+\)/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Rust crates \(\d+\)/i })).toBeVisible()

  await page.locator('summary').first().click()
  await expect(page.locator('details[open] pre').first()).toBeVisible()
  await expect(page.locator('details[open] pre').first()).toContainText(
    /Permission is hereby granted|Apache License/i,
  )
})
