import { Browser, expect, Page } from '@playwright/test';

export type DemoUser = 'admin' | 'accountant' | 'owner';
export const DEMO_PASSWORD = 'demo1234';

/** Fails the test on any uncaught page error or in-app "Unexpected error" dialog. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function expectNoErrors(page: Page, errors: string[]) {
  expect(errors, 'uncaught page errors').toEqual([]);
  await expect(page.getByText(/Unexpected error|خطأ غير متوقع/)).toHaveCount(0);
}

/** Welcome screen → demo company (UAT only). Ends on the sign-in screen. */
export async function loadDemo(page: Page, lang: 'en' | 'ar' = 'en') {
  await page.goto('/');
  if (lang === 'ar') await page.getByText('العربية').first().click();
  await page.getByTestId('terms-consent').click();
  await page.getByText(lang === 'ar' ? /تحميل شركة تجريبية|Load Demo Company/ : /Load Demo Company/).click();
  await expect(page.getByText(lang === 'ar' ? 'إبقائي مسجلاً' : 'Keep me signed in')).toBeVisible();
}

export async function signIn(page: Page, username: DemoUser | string, password = DEMO_PASSWORD, lang: 'en' | 'ar' = 'en') {
  const inputs = page.locator('input');
  await inputs.nth(0).fill(username);
  await inputs.nth(1).fill(password);
  await page.getByText(lang === 'ar' ? 'تسجيل الدخول' : 'Sign in', { exact: true }).last().click();
  await expect(page.getByLabel(lang === 'ar' ? 'حسابي' : 'My Account')).toBeVisible();
}

export async function demoSignIn(page: Page, user: DemoUser, lang: 'en' | 'ar' = 'en') {
  await loadDemo(page, lang);
  await signIn(page, user, DEMO_PASSWORD, lang);
}

/** Opens the newest posted sales invoice of the demo company. */
export async function openPostedInvoice(page: Page) {
  await page.goto('/moves?type=out_invoice');
  await page.getByText(/^INV\/\d{4}\/\d+/).first().click();
  await expect(page.getByText(/^(Download PDF|تنزيل PDF|تحميل PDF)$/)).toBeVisible();
}

/** Taps a button, then the same-named confirm button in the in-app dialog. */
export async function pressAndConfirm(page: Page, label: string | RegExp, confirmLabel: string | RegExp = label) {
  await page.getByText(label, { exact: typeof label === 'string' }).last().click();
  await page.getByText(confirmLabel, { exact: typeof confirmLabel === 'string' }).last().click();
}

/** A till receipt, as printed. */
export const RECEIPT_HTML = `<div style="width:420px;font-family:'Courier New',monospace;font-size:24px;line-height:1.5">SHELL BAUSHER<br>Receipt # 55102<br>08-11-2026 14:22<br>Unleaded 91<br>TOTAL OMR 15.750<br>Prices include VAT 5%</div>`;

/** A "photo" of some paper or picture: a screenshot of the HTML, as a PNG. */
export async function photo(browser: Browser, html: string) {
  const p = await browser.newPage({ viewport: { width: 520, height: 420 } });
  await p.setContent(`<body style="margin:0;padding:40px;background:#fff">${html}</body>`);
  const data = await p.screenshot();
  await p.close();
  return data;
}
