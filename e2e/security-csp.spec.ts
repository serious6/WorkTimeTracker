import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { addEntry, createProject, expectHeading, gotoPage, register } from './helpers'

declare global {
  interface Window {
    cspViolations: string[]
  }
}

const config = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as { app: { security: { csp: string; dangerousDisableAssetCspModification?: unknown } } }

const csp = config.app.security.csp

// The preview server serves the same bundle the desktop application ships, but
// without the policy Tauri injects into its own responses. Adding the header to
// the document response reproduces the production webview in the browser.
async function serveWithCsp(page: Page, baseURL: string | undefined) {
  await page.route(new URL('/', baseURL).href, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    })
  })
  await page.addInitScript(() => {
    window.cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI || event.sourceFile}`)
    })
  })
}

function violations(page: Page) {
  return page.evaluate(() => window.cspViolations)
}

// SEC1 in docs/e2e-test-cases.md
test('SEC1: the shipped policy states the protective directives and allows no inline code', async () => {
  expect(config.app.security.dangerousDisableAssetCspModification).toBeUndefined()
  expect(csp).not.toContain('unsafe-inline')
  expect(csp).not.toContain('unsafe-eval')
  for (const directive of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ]) {
    expect(csp).toContain(directive)
  }
})

// SEC2 in docs/e2e-test-cases.md
test('SEC2: the application renders under the production policy without a violation', async ({ page, baseURL }) => {
  await serveWithCsp(page, baseURL)
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')

  await createProject(page, 'Website')
  await addEntry(page, 'Website', '09:00', '10:30')

  const items = page.getByRole('navigation', { name: 'Main' }).getByRole('listitem').getByRole('button')
  const count = await items.count()
  expect(count).toBeGreaterThan(1)
  for (let index = 0; index < count; index += 1) {
    await items.nth(index).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }

  // The project colors are written through the CSSOM, which the policy leaves alone: without
  // `style-src 'unsafe-inline'` the dynamic styles of the application still reach the element.
  await gotoPage(page, 'Projects')
  const swatch = page.locator('[style*="background-color"]').first()
  await expect(swatch).toBeVisible()
  await expect(swatch).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  expect(await violations(page)).toEqual([])
})

// SEC3 in docs/e2e-test-cases.md
test('SEC3: the policy blocks an injected stylesheet and an injected script', async ({ page, baseURL }) => {
  await serveWithCsp(page, baseURL)
  await page.goto('/')
  await register(page, 'first@example.com')
  await expectHeading(page, 'Dashboard')

  const applied = await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = 'body { --injected: 1; }'
    document.head.append(style)
    const script = document.createElement('script')
    script.textContent = 'window.injected = true'
    document.head.append(script)
    return {
      style: getComputedStyle(document.body).getPropertyValue('--injected').trim(),
      script: 'injected' in window,
    }
  })

  expect(applied).toEqual({ style: '', script: false })
  expect(await violations(page)).toEqual(['style-src-elem inline', 'script-src-elem inline'])
})
