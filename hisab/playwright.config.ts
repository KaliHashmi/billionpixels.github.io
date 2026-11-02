import { defineConfig, devices } from '@playwright/test';

/**
 * Browser (end-to-end) tests against the web build of the UAT variant.
 *   npm run test:e2e        builds dist/ and runs the tests
 * Each test starts from an empty browser profile, so it begins at the welcome screen.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs dist 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
