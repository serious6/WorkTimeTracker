import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Playwright defaults to half of the cores, which serialises the suite on a
  // two core machine; the tests are mostly waiting, so one worker per core is
  // faster. The HTML report only pays off when it is uploaded as an artifact.
  workers: '100%',
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // A production build is served instead of the dev server: the build takes a
  // couple of seconds once, while the dev server transforms the modules again
  // for every page load of every test. The `test-e2e` mode keeps the browser
  // storage fallback available, which a plain production build refuses to use.
  webServer: [
    {
      command:
        'npx vite build --mode test-e2e && npx vite preview --host 127.0.0.1 --port 1420 --strictPort',
      url: 'http://127.0.0.1:1420',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The landing page in `docs/site` ships as plain files; serving that folder
    // statically lets the website spec load it like GitHub Pages does.
    {
      command:
        'npx vite preview --outDir docs/site --host 127.0.0.1 --port 1421 --strictPort',
      url: 'http://127.0.0.1:1421',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
