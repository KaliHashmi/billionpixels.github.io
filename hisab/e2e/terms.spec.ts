import { expect, test } from '@playwright/test';
import { expectNoErrors, watchErrors } from './helpers';

test('a company cannot be created until the terms are accepted, and the acceptance is recorded', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const inputs = page.locator('input');
  await page.getByLabel('Company Name').fill('Consent Test LLC');
  await page.getByText('Create Company', { exact: true }).click();
  await expect(page.getByText('Please accept the Terms of Use and the Privacy Policy to continue.')).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();

  const consent = page.getByTestId('terms-consent');
  await expect(consent).toHaveAttribute('aria-checked', 'false');
  await consent.click();
  await expect(consent).toHaveAttribute('aria-checked', 'true');
  const count = await inputs.count();
  await inputs.nth(count - 2).fill('Secret123');
  await inputs.nth(count - 1).fill('Secret123');
  await page.getByText('Create Company', { exact: true }).click();
  await expect(page.getByLabel('My Account')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Terms accepted')).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Arabic: the demo company also needs the terms accepted', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByText('العربية').first().click();
  await page.getByText(/تحميل شركة تجريبية/).click();
  await expect(page.getByText('يُرجى الموافقة على شروط الاستخدام وسياسة الخصوصية للمتابعة.')).toBeVisible();
  await page.getByText('حسناً', { exact: true }).last().click();
  await page.getByTestId('terms-consent').click();
  await page.getByText(/تحميل شركة تجريبية/).click();
  await expect(page.getByText('إبقائي مسجلاً')).toBeVisible();
  await expectNoErrors(page, errors);
});
