import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/**
 * Browser tests against the production build, which has no demo company:
 *   npm run test:e2e:prod
 * Only the tests that start from an empty company run here (business flows) and the production-only checks.
 */
export default defineConfig({
  ...base,
  testMatch: ['business.spec.ts', 'production.spec.ts'],
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176' },
  webServer: { command: 'node e2e/serve.mjs dist-prod 4176', url: 'http://127.0.0.1:4176', reuseExistingServer: !process.env.CI },
});
