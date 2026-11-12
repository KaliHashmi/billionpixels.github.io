import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/**
 * The same browser tests, against the published UAT site (GitHub Pages) instead of a local build.
 *   npm run test:e2e:live      after a deploy: proves the live site works, demo accounts included
 */
export default defineConfig({
  ...base,
  // The live site is further away than a local build.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 4,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4180' },
  webServer: {
    command: 'node e2e/live-proxy.mjs 4180',
    url: 'http://127.0.0.1:4180/billionpixels.github.io/hisab-uat/',
    reuseExistingServer: false,
    // Behind a company or cloud proxy, Node's fetch has to be told to use it.
    env: { NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  },
});
