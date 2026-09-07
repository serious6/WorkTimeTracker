import { expect, test, type Page } from '@playwright/test'

// The landing page is served from its own static server, because it ships as
// plain files instead of being part of the application bundle.
const SITE_URL = 'http://127.0.0.1:1421/'
const API_URL = 'https://api.github.com/repos/serious6/WorkTimeTracker/releases'

const release = {
  tag_name: 'v1.2.3',
  draft: false,
  published_at: '2026-03-04T10:00:00.000Z',
  body: 'First public release.',
  assets: [
    {
      name: 'WorkTimeTracker_1.2.3_x64.msi',
      browser_download_url:
        'https://github.com/serious6/WorkTimeTracker/releases/download/v1.2.3/WorkTimeTracker_1.2.3_x64.msi',
      size: 1_572_864,
      download_count: 1,
    },
  ],
}

// The page requests the API cross-origin, so a fulfilled response needs the
// CORS header the real API sends.
const cors = { 'access-control-allow-origin': '*' }

async function answerReleaseApi(page: Page, respond: Parameters<Page['route']>[1]) {
  await page.route(API_URL, respond)
}

// WEB1 in docs/e2e-test-cases.md
test('WEB1: the landing page renders the latest release with its installer', async ({ page }) => {
  await answerReleaseApi(page, (route) => route.fulfill({ json: [release], headers: cors }))
  await page.goto(SITE_URL)

  await expect(page.getByRole('heading', { name: 'Latest release: v1.2.3' })).toBeVisible()
  await expect(page.getByText('First public release.')).toBeVisible()
  const asset = page.getByRole('link', { name: /Windows · WorkTimeTracker_1\.2\.3_x64\.msi/ })
  await expect(asset).toHaveAttribute('href', release.assets[0].browser_download_url)
  await expect(page.getByText('1.5 MB · 1 download')).toBeVisible()
  await expect(page.locator('#release-content')).toHaveAttribute('aria-busy', 'false')
})

// WEB2 in docs/e2e-test-cases.md
test('WEB2: the landing page explains a rate-limited and a failed release request', async ({
  page,
}) => {
  await answerReleaseApi(page, (route) => route.fulfill({ status: 429, json: {}, headers: cors }))
  await page.goto(SITE_URL)
  await expect(page.getByRole('heading', { name: 'Downloads are temporarily busy' })).toBeVisible()

  await answerReleaseApi(page, (route) => route.abort())
  await page.goto(SITE_URL)
  await expect(page.getByRole('heading', { name: 'Couldn’t load releases' })).toBeVisible()
  await expect(page.getByRole('link', { name: /View releases on GitHub/ })).toBeVisible()
})

// WEB3 in docs/e2e-test-cases.md
test('WEB3: the landing page explains how to obtain, give feedback and contribute', async ({
  page,
}) => {
  await answerReleaseApi(page, (route) => route.fulfill({ json: [release], headers: cors }))
  await page.goto(SITE_URL)

  await page.getByRole('link', { name: 'Get involved' }).click()
  const involved = page.locator('#get-involved')
  await expect(involved.getByRole('heading', { name: 'Get involved', level: 2 })).toBeVisible()
  await expect(involved.getByRole('heading', { name: 'Obtain the software' })).toBeVisible()
  await expect(involved.getByRole('heading', { name: 'Provide feedback' })).toBeVisible()
  await expect(involved.getByRole('heading', { name: 'Contribute' })).toBeVisible()

  await expect(involved.getByRole('link', { name: 'installation guide' })).toHaveAttribute(
    'href',
    'https://github.com/serious6/WorkTimeTracker/blob/main/docs/installation.md',
  )
  await expect(involved.getByRole('link', { name: 'open a new issue' })).toHaveAttribute(
    'href',
    'https://github.com/serious6/WorkTimeTracker/issues/new/choose',
  )
  await expect(involved.getByRole('link', { name: 'SECURITY.md' })).toHaveAttribute(
    'href',
    'https://github.com/serious6/WorkTimeTracker/blob/main/SECURITY.md',
  )
  await expect(involved.getByRole('link', { name: 'CONTRIBUTING.md' })).toHaveAttribute(
    'href',
    'https://github.com/serious6/WorkTimeTracker/blob/main/CONTRIBUTING.md',
  )
})
