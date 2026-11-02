import { expect, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, openPostedInvoice, watchErrors } from './helpers';

// Issued documents: administrators edit and delete, accountants only delete, viewers neither.
const cases = [
  { user: 'admin', edit: true, del: true },
  { user: 'accountant', edit: false, del: true },
  { user: 'owner', edit: false, del: false },
] as const;

for (const c of cases) {
  test(`${c.user}: edit ${c.edit ? 'allowed' : 'hidden'}, delete ${c.del ? 'allowed' : 'hidden'} on a posted invoice`, async ({ page }) => {
    const errors = watchErrors(page);
    await demoSignIn(page, c.user);
    await openPostedInvoice(page);
    await expect(page.getByText('Edit', { exact: true })).toHaveCount(c.edit ? 1 : 0);
    await expect(page.getByText('Delete', { exact: true })).toHaveCount(c.del ? 1 : 0);
    await expect(page.getByText('Download PDF')).toBeVisible(); // everyone can print
    await expectNoErrors(page, errors);
  });
}

test('administration screens are for administrators only', async ({ page }) => {
  await demoSignIn(page, 'accountant');
  for (const path of ['/settings', '/users', '/stamp']) {
    await page.goto(path);
    await expect(page.getByText('Administrators only')).toBeVisible();
  }
});

test('accountant deletes an issued invoice', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant');
  await openPostedInvoice(page);
  const name = (await page.getByText(/^INV\/\d{4}\/\d+$/).first().textContent())!;
  await page.getByText('Delete', { exact: true }).click();
  await page.getByText(/^Delete/).last().click();
  await page.goto('/moves?type=out_invoice');
  await expect(page.getByText('Sales Invoices').first()).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expectNoErrors(page, errors);
});
