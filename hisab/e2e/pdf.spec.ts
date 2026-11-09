import { expect, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, openPostedInvoice, watchErrors } from './helpers';

test('an invoice downloads as a PDF', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await openPostedInvoice(page);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByText('Download PDF').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^INV-\d{4}-\d+.*\.pdf$/);
  const [first] = (await (await file.createReadStream()).toArray()) as Uint8Array[];
  expect(new TextDecoder().decode(first.subarray(0, 5))).toBe('%PDF-');
  await expectNoErrors(page, errors);
});

// Records what the browser is asked to print: the app screen, or a document frame (and its text).
async function watchPrint(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: string[] };
    w.__printed = [];
    window.print = () => void w.__printed.push('SCREEN');
    // Spy on the frame's print at the moment the app reaches for it (its window changes when the document is written).
    const get = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!.get!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get(this: HTMLIFrameElement) {
        const win = get.call(this) as Window | null;
        const frame = this;
        if (win) win.print = () => void w.__printed.push(frame.contentDocument?.body?.innerText ?? '');
        return win;
      },
    });
  });
}

test('Print on the web prints the invoice itself, not the screen', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await watchPrint(page);
  await demoSignIn(page, 'admin');
  await openPostedInvoice(page);
  await page.getByText('Print', { exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length), { timeout: 30_000 }).toBe(1);
  const [printed] = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);
  expect(printed).not.toBe('SCREEN');
  expect(printed).toContain('TAX INVOICE');
  expect(printed).toContain('فاتورة ضريبية');
  await expectNoErrors(page, errors);
});

test('Arabic: Print on the web prints the payment voucher', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await watchPrint(page);
  await demoSignIn(page, 'admin', 'ar');
  await page.goto('/payments?partnerType=supplier');
  await page.getByText(/^PV\/\d{4}\/\d+ · /).first().click();
  await page.getByText('طباعة', { exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length), { timeout: 30_000 }).toBe(1);
  const [printed] = await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed);
  expect(printed).toContain('PAYMENT VOUCHER');
  expect(printed).toContain('سند صرف');
  await expectNoErrors(page, errors);
});
