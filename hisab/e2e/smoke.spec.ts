import { expect, test } from '@playwright/test';
import { demoSignIn, DemoUser, expectNoErrors, watchErrors } from './helpers';

// Every main screen opens without errors, for each role and in both languages.
const SCREENS = [
  '/', '/customers', '/vendors', '/accounting', '/reports', '/account',
  '/moves?type=out_invoice', '/moves?type=in_invoice', '/moves?type=entry',
  '/payments?partnerType=customer', '/payments?partnerType=supplier',
  '/scan', '/bank', '/cashbook', '/cheques', '/cash-closing', '/followups', '/assets', '/budgets', '/payroll', '/tax-return', '/items',
];
const REPORTS = [
  'profit-loss', 'balance-sheet', 'cash-flow', 'executive-summary', 'trial-balance', 'general-ledger', 'partner-ledger',
  'journal-audit', 'aged-receivable', 'aged-payable', 'customer-outstanding', 'supplier-outstanding', 'cash-position',
  'pending', 'unallocated', 'cheques', 'bank-reconciliation', 'vat', 'expenses', 'budget', 'payroll', 'analytic',
];
const ADMIN = ['/settings', '/users', '/stamp', '/audit'];

for (const lang of ['en', 'ar'] as const) {
  for (const user of ['admin', 'accountant', 'owner'] as DemoUser[]) {
    test(`all screens open: ${user} (${lang})`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await demoSignIn(page, user, lang);
      const paths = [...SCREENS, ...REPORTS.map((r) => `/reports/${r}`), ...(user === 'admin' ? ADMIN : [])];
      for (const path of paths) {
        await page.goto(path);
        // A screen has loaded once its title (or, on the tabs, the account button) is showing.
        await expect(page.getByRole('heading').or(page.getByLabel(lang === 'ar' ? 'حسابي' : 'My Account')).first(), path).toBeVisible();
        await expect(page.getByText(/Unexpected error|خطأ غير متوقع|Unmatched Route|This screen doesn't exist/), path).toHaveCount(0);
      }
      await expectNoErrors(page, errors);
    });
  }
}
