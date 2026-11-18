// Draft store screenshots (iPhone 6.9", 1320 × 2868) in English and Arabic, from the production web build
// with the demo company's books renamed to a realistic company. The production build has no demo company,
// so the books are taken from the UAT build and placed in the production build's storage.
//   npm run build:e2e && APP_VARIANT=production CI=1 npx expo export --platform web --output-dir dist-prod
//   node scripts/store-screenshots.mjs [outDir]          (default: store-assets/screenshots-draft/)
// Before submitting, replace these with screenshots of the TestFlight build on a real iPhone (status bar, fonts).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'store-assets/screenshots-draft';
// Clearly sample names: store screenshots must not suggest that a real business uses Hisab (no customer
// names or logos without written permission). The demo data has names that may belong to real companies.
const COMPANY = { en: 'Sample Trading LLC', ar: 'شركة نموذجية للتجارة ش.م.م' };
const PARTNERS = {
  'Al Noor Hypermarket': 'Sample Hypermarket LLC',
  'Sohar Tech Solutions': 'Sample Tech Co.',
  'Nizwa Heritage Hotel': 'Sample Hotel',
  'Muscat Office Supplies': 'Sample Office Supplies',
  'Nama Electricity': 'Electricity Company',
  'Qurum Properties LLC': 'Sample Properties LLC',
  'CloudSoft Ltd (UK)': 'Sample Software Ltd (UK)',
};
// What the listing shows, in order (name → address in the app).
const SHOTS = [
  ['1-dashboard', '/'],
  ['2-invoice', 'invoice'], // the newest issued invoice
  ['3-invoices', '/moves?type=out_invoice'],
  ['4-vat', '/tax-return'],
  ['5-payroll', 'payroll'], // the latest payroll, with social insurance
  ['6-reports', '/reports/profit-loss'],
  ['7-bank', '/bank'],
];

const serve = (dir, port) => spawn(process.execPath, ['e2e/serve.mjs', dir, String(port)], { stdio: 'ignore' });
const servers = [serve('dist', 4191), serve('dist-prod', 4192)];
await new Promise((r) => setTimeout(r, 1200));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  // 1. The demo company's books, from the UAT build.
  const uat = await browser.newPage();
  await uat.goto('http://127.0.0.1:4191/');
  await uat.getByTestId('terms-consent').click();
  await uat.getByText(/Load Demo Company/).click();
  await uat.getByText('Keep me signed in').waitFor();
  const books = JSON.parse(await uat.evaluate(() => localStorage.getItem('hisab:hisab-uat.db')));
  books.settings.companyName = COMPANY.en;
  books.settings.companyNameAr = COMPANY.ar;
  for (const p of books.partners) p.name = PARTNERS[p.name] ?? p.name;

  for (const lang of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    // 2. Into the production build: same books, production storage key, chosen language.
    await page.goto('http://127.0.0.1:4192/');
    await page.evaluate(([b, l]) => {
      localStorage.setItem('hisab:hisab.db', b);
      localStorage.setItem('hisab:pref:lang', l);
    }, [JSON.stringify(books), lang]);
    await page.reload();
    const inputs = page.locator('input');
    await inputs.nth(0).fill('admin');
    await inputs.nth(1).fill('demo1234');
    await page.getByText(lang === 'ar' ? 'تسجيل الدخول' : 'Sign in', { exact: true }).last().click();
    await page.getByLabel(lang === 'ar' ? 'حسابي' : 'My Account').waitFor();
    for (const [name, path] of SHOTS) {
      if (path === 'invoice') {
        await page.goto('http://127.0.0.1:4192/moves?type=out_invoice');
        await page.getByText(/^INV\/\d{4}\/\d+/).first().click();
      } else if (path === 'payroll') {
        await page.goto('http://127.0.0.1:4192/payroll');
        await page.getByText(/ 2026$| \d{4}$/).first().click();
      } else await page.goto('http://127.0.0.1:4192' + path);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${lang}-${name}.png` });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const s of servers) s.kill();
}
console.log(`Saved to ${OUT}/`);
