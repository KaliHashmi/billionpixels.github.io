import { expect, test } from '@playwright/test';
import { demoSignIn, DEMO_PASSWORD, expectNoErrors, signIn, watchErrors } from './helpers';

async function deleteMyAccount(page: import('@playwright/test').Page, password: string) {
  await page.goto('/account');
  await page.locator('input[type=password]').last().fill(password);
  await page.getByText('Delete My Account', { exact: true }).last().click(); // section button
  await page.getByText('Delete My Account', { exact: true }).last().click(); // confirm dialog
}

test('a user deletes their own account and can no longer sign in', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'owner');
  await deleteMyAccount(page, 'wrong-pass1');
  await expect(page.getByText('The password is incorrect.')).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await deleteMyAccount(page, DEMO_PASSWORD);
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await page.locator('input').nth(0).fill('owner');
  await page.locator('input').nth(1).fill(DEMO_PASSWORD);
  await page.getByText('Sign in', { exact: true }).last().click();
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
  await signIn(page, 'admin'); // the company and other users are untouched
  await expectNoErrors(page, errors);
});

test('the only administrator cannot delete their own account', async ({ page }) => {
  await demoSignIn(page, 'admin');
  await deleteMyAccount(page, DEMO_PASSWORD);
  await expect(page.getByText(/You are the only administrator/)).toBeVisible();
});

test('an administrator deletes another user', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await page.goto('/users');
  await page.getByText('Demo Accountant', { exact: false }).click();
  await page.getByText('Delete User', { exact: true }).click();
  await page.getByText('Delete', { exact: true }).last().click();
  await expect(page.getByText('Users & Access').first()).toBeVisible();
  await expect(page.getByText('Demo Accountant', { exact: false })).toHaveCount(0);
  await expectNoErrors(page, errors);
});

test('Delete Company erases the books and the saved sign-in', async ({ page }) => {
  await demoSignIn(page, 'admin');
  await page.goto('/settings');
  await page.getByText('Delete Company', { exact: true }).click();
  await page.getByText('Delete Everything', { exact: true }).click();
  await page.getByText('Yes, erase', { exact: true }).click();
  await expect(page.getByText('Set up your company')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'hisab:pref:lang'));
  expect(keys).toEqual([]);
});
