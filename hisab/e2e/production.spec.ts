import { expect, test } from '@playwright/test';
import { expectNoErrors, watchErrors } from './helpers';

// Production build only (npm run test:e2e:prod): no demo company, no UAT label, its own database.
test('production: no demo company or UAT label, and the books use the production database', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByLabel('Company Name').first()).toBeVisible();
  await expect(page.getByText(/Load Demo Company/)).toHaveCount(0);
  await expect(page.getByText('UAT', { exact: true })).toHaveCount(0);
  await page.getByLabel('Company Name').first().fill('Production Check LLC');
  await page.getByTestId('terms-consent').click();
  const pw = page.locator('input[type=password]');
  await pw.nth(0).fill('Secret123');
  await pw.nth(1).fill('Secret123');
  await page.getByText('Create Company', { exact: true }).click();
  await expect(page.getByLabel('My Account')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByText('production', { exact: true })).toBeVisible();
  await expect(page.getByText('hisab.db', { exact: true })).toBeVisible();
  await expectNoErrors(page, errors);
});
