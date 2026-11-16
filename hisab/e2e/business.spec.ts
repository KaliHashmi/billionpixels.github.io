import { expect, Page, test } from '@playwright/test';
import { expectNoErrors, watchErrors } from './helpers';

// The everyday work of a real company, started from an empty company with no demo data, so these tests
// also run against the production build (npm run test:e2e:prod), which has no demo company.

const PASSWORD = 'Secret123';

/** Text that is exactly this amount (with or without the currency), so 5.000 never matches 105.000. */
const amount = (v: string) => new RegExp(`(^|[^0-9.,])${v.replace('.', '\\.')}$`);

/** Welcome screen → a new company with its administrator ("admin"), signed in. */
async function createCompany(page: Page, name: string, lang: 'en' | 'ar' = 'en') {
  await page.goto('/');
  if (lang === 'ar') await page.getByText('العربية').first().click();
  await page.getByLabel(lang === 'ar' ? 'اسم الشركة' : 'Company Name').fill(name);
  await page.getByTestId('terms-consent').click();
  const inputs = page.locator('input[type=password]');
  await inputs.nth(0).fill(PASSWORD);
  await inputs.nth(1).fill(PASSWORD);
  await page.getByText(lang === 'ar' ? 'إنشاء الشركة' : 'Create Company', { exact: true }).click();
  await expect(page.getByLabel(lang === 'ar' ? 'حسابي' : 'My Account')).toBeVisible();
}

/** Opens a dropdown field by its label and picks an option, or creates it from the search box. */
async function pick(page: Page, field: string, option: string | RegExp, create = false) {
  await page.getByRole('button', { name: new RegExp(`^${field}:`) }).first().click();
  if (create && typeof option === 'string') {
    await page.getByPlaceholder(/Search|بحث/).last().fill(option);
    await page.getByText(new RegExp(`^(Create|إنشاء) "${option}"`)).click();
  } else {
    await page.getByText(option, { exact: typeof option === 'string' }).last().click();
  }
}

/** A new invoice or bill with one line, confirmed. Returns its number. */
async function issue(page: Page, type: 'out_invoice' | 'in_invoice', partner: string, label: string, price: number) {
  await page.goto(`/moves/new?type=${type}`);
  await pick(page, type === 'out_invoice' ? 'Customer' : 'Vendor', partner, true);
  await page.getByText('Add a line', { exact: true }).first().click();
  await page.getByLabel('Description').last().fill(label);
  await page.getByLabel('Unit Price').last().fill(String(price));
  await page.getByText('Confirm', { exact: true }).first().click();
  const number = page.getByText(type === 'out_invoice' ? /^INV\/\d{4}\/\d{5}$/ : /^BILL\/\d{4}\/\d{5}$/).first();
  await expect(number).toBeVisible();
  return (await number.textContent())!;
}

/** Registers the full amount of the open invoice or bill on screen, in cash. */
async function payInCash(page: Page) {
  await page.getByText('Register Payment', { exact: true }).first().click();
  await pick(page, 'Bank / Cash', /^Cash/);
  await page.getByText('Confirm', { exact: true }).last().click();
}

test('a new company invoices a customer, is paid, pays a bill, and the reports and VAT agree', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await createCompany(page, 'Flow Trading LLC');
  await expect(page.getByText(/Load Demo Company/)).toHaveCount(0);

  // Sales invoice: 100.000 + VAT 5% = 105.000, paid in cash.
  const inv = await issue(page, 'out_invoice', 'Al Noor Stores', 'Consulting', 100);
  expect(inv).toMatch(/\/00001$/);
  await expect(page.getByText(amount('105.000')).first()).toBeVisible();
  await payInCash(page);
  await page.goto('/moves?type=out_invoice');
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  // Purchase bill: 200.000 + VAT 5% = 210.000, paid in cash.
  const bill = await issue(page, 'in_invoice', 'Muscat Office Rent', 'Office rent', 200);
  expect(bill).toMatch(/\/00001$/);
  await expect(page.getByText(amount('210.000')).first()).toBeVisible();
  await payInCash(page);
  await page.goto('/moves?type=in_invoice');
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  // Profit and loss: income 100, expense 200.
  await page.goto('/reports/profit-loss');
  await expect(page.getByText(amount('100.000')).first()).toBeVisible();
  await expect(page.getByText(amount('200.000')).first()).toBeVisible();
  // VAT: 5.000 collected, 10.000 paid.
  await page.goto('/reports/vat');
  await expect(page.getByText(amount('5.000')).first()).toBeVisible();
  await expect(page.getByText(amount('10.000')).first()).toBeVisible();
  // Cash book: 105.000 in, 210.000 out.
  await page.goto('/cashbook');
  await expect(page.getByText(amount('105.000')).first()).toBeVisible();
  await expect(page.getByText(amount('210.000')).first()).toBeVisible();
  // Every report opens with real numbers.
  for (const r of ['balance-sheet', 'trial-balance', 'general-ledger', 'partner-ledger', 'aged-receivable', 'aged-payable', 'cash-position', 'executive-summary', 'cash-flow', 'journal-audit']) {
    await page.goto(`/reports/${r}`);
    await expect(page.getByRole('heading').first(), r).toBeVisible();
    await expect(page.getByText(/Unexpected error|This screen doesn't exist/), r).toHaveCount(0);
  }
  await expectNoErrors(page, errors);
});

test('an administrator adds an accountant and a viewer; each signs in with the right permissions', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await createCompany(page, 'Roles Trading LLC');
  for (const [username, role] of [['sara', 'Accountant'], ['omar', 'Viewer (read-only)']]) {
    await page.goto('/users');
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByLabel('Full Name').fill(username === 'sara' ? 'Sara Al Balushi' : 'Omar Al Harthy');
    await page.getByLabel('Username').fill(username);
    await pick(page, 'Role', role);
    await page.getByLabel('Password', { exact: true }).fill('temp12345');
    await page.getByLabel('Confirm Password').fill('temp12345');
    await page.getByText('Save', { exact: true }).last().click();
    await expect(page.getByText(username === 'sara' ? 'Sara Al Balushi' : 'Omar Al Harthy').first()).toBeVisible();
  }
  const signInAs = async (user: string) => {
    await page.goto('/account');
    await page.getByText('Sign out', { exact: true }).first().click();
    const inputs = page.locator('input');
    await inputs.nth(0).fill(user);
    await inputs.nth(1).fill('temp12345');
    await page.getByText('Sign in', { exact: true }).last().click();
  };
  // A new user must choose their own password first.
  for (const user of ['sara', 'omar']) {
    await signInAs(user);
    await page.getByLabel('Temporary Password').fill('temp12345');
    await page.getByLabel('Password', { exact: true }).fill('Better123');
    await page.getByLabel('Confirm Password').fill('Better123');
    await page.getByText('Change Password', { exact: true }).last().click();
    await expect(page.getByLabel('My Account')).toBeVisible();
    await page.goto('/moves?type=out_invoice');
    if (user === 'sara') await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'New' })).toHaveCount(0);
    await page.goto('/users');
    await expect(page.getByText(/administrators|Administrators only|not allowed/i).first()).toBeVisible();
    await page.goto('/account');
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.locator('input').nth(0).fill(user);
    await page.locator('input').nth(1).fill('Better123');
    await page.getByText('Sign in', { exact: true }).last().click();
    await expect(page.getByLabel('My Account')).toBeVisible();
  }
  await expectNoErrors(page, errors);
});

test('a backup restores the books after the company is deleted', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await createCompany(page, 'Backup Trading LLC');
  const inv = await issue(page, 'out_invoice', 'Sohar Traders', 'Delivery', 40);
  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByText(/Export Backup|Back Up|Backup/).first().click();
  const file = await download;
  const path = await file.path();
  expect(file.suggestedFilename()).toMatch(/^hisab-backup-.*\.json$/);

  await page.getByText('Delete Company', { exact: true }).first().click();
  await page.getByText('Delete Everything', { exact: true }).last().click();
  await page.getByText('Yes, erase', { exact: true }).last().click();
  await expect(page.getByLabel('Company Name').first()).toBeVisible();

  await page.getByTestId('terms-consent').click(); // a restore also needs the terms accepted
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Restore from Backup', { exact: true }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByText('Backup Trading LLC')).toBeVisible(); // its sign-in screen
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input').nth(1).fill(PASSWORD);
  await page.getByText('Sign in', { exact: true }).last().click();
  await expect(page.getByLabel('My Account')).toBeVisible();
  await page.goto('/moves?type=out_invoice');
  await expect(page.getByText(inv).first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Arabic: a new company issues an invoice and is paid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await createCompany(page, 'شركة التدفق', 'ar');
  await page.goto('/moves/new?type=out_invoice');
  await page.getByRole('button', { name: /^العميل:/ }).click();
  await page.getByPlaceholder(/بحث|Search/).last().fill('متجر النور');
  await page.getByText(/^إنشاء "متجر النور"/).click();
  await page.getByText('إضافة سطر', { exact: true }).first().click();
  await page.getByLabel('الوصف').last().fill('استشارات');
  await page.getByLabel('سعر الوحدة').last().fill('100');
  await page.getByText('تأكيد', { exact: true }).first().click();
  await expect(page.getByText(/^INV\/\d{4}\/00001$/).first()).toBeVisible();
  await expect(page.getByText(amount('105.000')).first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('month end: the VAT return closes and locks the period, and payroll is posted and paid', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await createCompany(page, 'Month End LLC');
  await issue(page, 'out_invoice', 'Al Noor Stores', 'Consulting', 100);
  await issue(page, 'in_invoice', 'Muscat Office Rent', 'Office rent', 200);

  // VAT return for this quarter: 5.000 collected, 10.000 paid, 5.000 refundable.
  await page.goto('/tax-return');
  await expect(page.getByText(amount('5.000')).first()).toBeVisible();
  await expect(page.getByText(amount('10.000')).first()).toBeVisible();
  await expect(page.getByText('Net VAT refundable', { exact: true })).toBeVisible();
  await page.getByText('Close Period', { exact: true }).click();
  await page.getByText('Post Closing Entry', { exact: true }).last().click();
  await expect(page.getByText('VAT return closed', { exact: true })).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await expect(page.getByText('Cancel Closing', { exact: true }).first()).toBeVisible();
  // The closed period is locked for VAT: a new invoice dated in it is refused.
  await page.goto('/moves/new?type=out_invoice');
  await pick(page, 'Customer', 'Al Noor Stores');
  await page.getByText('Add a line', { exact: true }).first().click();
  await page.getByLabel('Description').last().fill('Late sale');
  await page.getByLabel('Unit Price').last().fill('10');
  await page.getByText('Confirm', { exact: true }).first().click();
  await expect(page.getByText(/tax lock date/).first()).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();

  // Payroll: one Omani employee on 500.000 basic, posted then paid from the bank.
  await page.goto('/config/employees');
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Employee Name').fill('Ahmed Al Rawahi');
  await page.getByLabel('Basic Salary').fill('500');
  await page.getByText('Save', { exact: true }).last().click();
  await expect(page.getByText('Ahmed Al Rawahi').first()).toBeVisible();
  await page.goto('/payroll');
  await page.getByText('New Payroll', { exact: true }).click();
  await expect(page.getByText('Gross salaries', { exact: true })).toBeVisible();
  await expect(page.getByText(amount('500.000')).first()).toBeVisible();
  // Omani employee: 8% employee and 14.5% employer social insurance, so 460.000 net.
  await expect(page.getByText(amount('40.000')).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(amount('72.500')).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(amount('460.000')).filter({ visible: true }).first()).toBeVisible();
  await page.getByText('Post Payroll', { exact: true }).click();
  await expect(page.getByText('Posted', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByText(/^Pay /).filter({ visible: true }).last().click();
  await expect(page.getByText('Paid', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expectNoErrors(page, errors);
});
