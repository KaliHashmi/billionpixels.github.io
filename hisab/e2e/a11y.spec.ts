import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { demoSignIn, openPostedInvoice } from './helpers';

/** WCAG 2.1 AA checks (colour contrast, labels, names, roles) on the main screens, in English and Arabic. */
async function scan(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const report = violations.map((v) => `${where}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' ' + JSON.stringify(n.any[0]?.data ?? '') + ' "' + n.html.replace(/<[^>]*>/g, '').slice(0, 30) + '"').join(' | ')}`);
  expect(report, report.join('\n')).toEqual([]);
}

for (const lang of ['en', 'ar'] as const) {
  test(`accessibility (${lang}): welcome, sign-in and main screens`, async ({ page }) => {
    await page.goto('/');
    if (lang === 'ar') await page.getByText('العربية').first().click();
    await scan(page, 'welcome');
    await demoSignIn(page, 'admin', lang);
    await scan(page, 'home');
    for (const path of ['/moves?type=out_invoice', '/moves?type=in_invoice', '/settings', '/account']) {
      await page.goto(path);
      await page.waitForTimeout(800);
      await scan(page, path);
    }
    await openPostedInvoice(page);
    await scan(page, 'invoice');
    // Purchase bills: CSV import buttons and the receipt photos card.
    await page.goto('/moves?type=in_invoice');
    await page.getByText(/^BILL\/\d{4}\/\d+$/).first().click();
    await page.getByText(lang === 'ar' ? 'صور الإيصالات' : 'Receipt Photos').waitFor();
    await scan(page, 'purchase bill');
  });
}

test('keyboard only: fill the welcome form, tick the terms and create the company', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Company Name').focus();
  await page.keyboard.type('Keyboard LLC');
  // Tab through every control until the terms checkbox has focus, then tick it with the space bar.
  const consent = page.getByTestId('terms-consent');
  for (let i = 0; i < 40 && !(await consent.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(consent).toBeFocused();
  await page.keyboard.press('Space');
  await expect(consent).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Password', { exact: true }).fill('Secret123');
  await page.getByLabel('Confirm Password').fill('Secret123');
  await page.getByLabel('Confirm Password').focus();
  for (let i = 0; i < 10 && !(await page.evaluate(() => document.activeElement?.textContent ?? '')).includes('Create Company'); i++) await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Create Company');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('My Account')).toBeVisible();
});
