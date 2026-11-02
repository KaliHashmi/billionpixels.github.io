import { expect, test } from '@playwright/test';
import { expectNoErrors, loadDemo, watchErrors } from './helpers';

test('privacy policy and support links open the public pages in a new tab', async ({ page, context }) => {
  const errors = watchErrors(page);
  const opened: string[] = [];
  await context.route('https://kalihashmi.github.io/**', (route) => {
    opened.push(route.request().url());
    return route.fulfill({ body: 'ok' });
  });
  await page.goto('/');
  for (const [label, path] of [['Privacy Policy', '/hisab/privacy/'], ['Support', '/hisab/support/']] as const) {
    const popup = context.waitForEvent('page');
    await page.getByText(label, { exact: true }).click();
    await (await popup).close();
    expect(opened.pop()).toContain(path);
  }
  await expect(page.getByText('Set up your company')).toBeVisible(); // the app stayed open
  await loadDemo(page);
  await expect(page.getByText('Privacy Policy', { exact: true })).toBeVisible(); // also on the sign-in screen
  await expectNoErrors(page, errors);
});

test('Arabic switches the whole interface', async ({ page }) => {
  const errors = watchErrors(page);
  await loadDemo(page, 'ar');
  await expect(page.getByText('تسجيل الدخول').first()).toBeVisible();
  await expect(page.getByText('سياسة الخصوصية')).toBeVisible();
  await expect(page.getByText('Sign in', { exact: true })).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('wrong password is rejected', async ({ page }) => {
  await loadDemo(page);
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input').nth(1).fill('wrong-pass1');
  await page.getByText('Sign in', { exact: true }).last().click();
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
});
