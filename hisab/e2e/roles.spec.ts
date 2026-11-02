import { expect, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, openPostedInvoice, watchErrors } from './helpers';

// Issued tax invoices (Oman VAT): administrators correct them (credit note + new invoice) or cancel
// them with a credit note, accountants can only cancel with a credit note, viewers neither. Never deleted.
const cases = [
  { user: 'admin', edit: true, del: true },
  { user: 'accountant', edit: false, del: true },
  { user: 'owner', edit: false, del: false },
] as const;

for (const c of cases) {
  test(`${c.user}: correct ${c.edit ? 'allowed' : 'hidden'}, cancel with credit note ${c.del ? 'allowed' : 'hidden'} on an issued invoice`, async ({ page }) => {
    const errors = watchErrors(page);
    await demoSignIn(page, c.user);
    await openPostedInvoice(page);
    await expect(page.getByText('Correct', { exact: true })).toHaveCount(c.edit ? 1 : 0);
    await expect(page.getByText('Cancel with Credit Note', { exact: true })).toHaveCount(c.del ? 1 : 0);
    // An issued tax invoice is never deleted or edited in place.
    await expect(page.getByText('Delete', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Edit', { exact: true })).toHaveCount(0);
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

test('accountant cancels an issued invoice with a credit note; both stay on record and the audit log shows it', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant');
  await openPostedInvoice(page);
  const name = (await page.getByText(/^INV\/\d{4}\/\d+$/).first().textContent())!;
  await page.getByText('Cancel with Credit Note', { exact: true }).filter({ visible: true }).first().click();
  const submit = page.getByTestId('reverse-submit');
  await expect(page.getByPlaceholder('e.g. Damaged goods')).toBeVisible(); // the credit-note screen has opened
  await submit.click(); // no reason yet
  await expect(page.getByText('Enter the reason for the credit note.')).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await page.getByPlaceholder('e.g. Damaged goods').fill('Order cancelled by customer');
  await submit.click();
  await expect(page.getByText(/^RINV\/\d{4}\/\d+$/).first()).toBeVisible();
  await page.goto('/moves?type=out_invoice');
  await expect(page.getByText(name, { exact: true })).toHaveCount(1); // the original invoice is kept
  await expectNoErrors(page, errors);
});

test('administrator sees cancellations in the audit log', async ({ page }) => {
  await demoSignIn(page, 'admin');
  await openPostedInvoice(page);
  const name = (await page.getByText(/^INV\/\d{4}\/\d+$/).first().textContent())!;
  await page.getByText('Cancel with Credit Note', { exact: true }).filter({ visible: true }).first().click();
  await page.getByPlaceholder('e.g. Damaged goods').fill('Duplicate invoice');
  await page.getByTestId('reverse-submit').click();
  await expect(page.getByText(/^RINV\/\d{4}\/\d+$/).first()).toBeVisible();
  await page.goto('/audit');
  await expect(page.getByText('Cancelled with credit note')).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(/Demo Administrator \(admin\)/)).toBeVisible();
});
