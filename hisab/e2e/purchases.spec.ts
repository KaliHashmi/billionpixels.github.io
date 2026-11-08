import { expect, Page, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, photo, RECEIPT_HTML, watchErrors } from './helpers';

// The tests run in Node, but the project's TypeScript settings have no Node types.
declare const Buffer: { from(data: string, encoding?: 'base64'): Uint8Array };

const CSV = [
  'date,type,vendor,reference,description,account,amount,vat,paid_from',
  '01/11/2026,bill,E2E Paper Co,E2E-001,Printer paper,,120.000,5,',
  '02/11/2026,bill,E2E Paper Co,E2E-002,Toner,,80,5,',
  '03/11/2026,expense,,,E2E fuel,,15,5,cash',
  'not a date,bill,E2E Paper Co,E2E-003,Bad row,,10,5,',
].join('\n');

// A picture with no accounting text on it (a face, a pet, a holiday photo would read the same).
const PICTURE = '<div style="width:200px;height:200px;border-radius:100px;background:#f2c94c"></div><div style="font-size:36px">Happy Birthday!</div>';

async function choose(page: Page, button: string | RegExp, file: { name: string; mimeType: string; buffer: Uint8Array }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByText(button, { exact: typeof button === 'string' }).click();
  await (await chooser).setFiles(file);
}

test('purchase bills and cash expenses are imported from a CSV file, and bad rows are listed', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await page.goto('/moves?type=in_invoice');
  await choose(page, 'Import CSV', { name: 'purchases.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByText(/2 bill\(s\) and 1 expense\(s\)/)).toBeVisible();
  await expect(page.getByText(/Row 5: Invalid date "not a date"/)).toBeVisible();
  await page.getByText('Import', { exact: true }).last().click();
  await expect(page.getByText('2 bill(s) and 1 expense(s) imported.')).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await page.getByPlaceholder(/Search/).fill('E2E Paper');
  await expect(page.getByText(/^BILL\/\d{4}\/\d+$/)).toHaveCount(2);

  // Importing the same file again does not add the bills twice.
  await choose(page, 'Import CSV', { name: 'purchases.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByText(/Bill E2E-001 from E2E Paper Co is already in Hisab/)).toBeVisible();
  await expectNoErrors(page, errors);
});

test('the CSV template downloads', async ({ page }) => {
  await demoSignIn(page, 'accountant');
  await page.goto('/moves?type=in_invoice');
  const download = page.waitForEvent('download');
  await page.getByText('CSV Template', { exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('hisab-purchases-template.csv');
  const chunks = (await (await file.createReadStream()).toArray()) as Uint8Array[];
  const text = chunks.map((c) => new TextDecoder().decode(c)).join('');
  expect(text).toContain('date,type,vendor,reference,description,account,amount,vat,paid_from');
});

test('Arabic: purchases are imported with Arabic column names', async ({ page }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin', 'ar');
  await page.goto('/moves?type=in_invoice');
  const csv = 'التاريخ,النوع,المورد,المرجع,المبلغ,الضريبة\n05/11/2026,فاتورة,مؤسسة الاختبار,AR-1,50,5';
  await choose(page, 'استيراد CSV', { name: 'مشتريات.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByText('استيراد', { exact: true }).last().click();
  await expect(page.getByText('تم استيراد 1 فاتورة و0 مصروف.')).toBeVisible();
  await expectNoErrors(page, errors);
});

test('a receipt photo is checked, kept with a purchase bill and can be viewed', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await page.goto('/moves?type=in_invoice');
  await page.getByText(/^BILL\/\d{4}\/\d+$/).first().click();
  await expect(page.getByText('Receipt Photos')).toBeVisible();
  await choose(page, 'Choose Photo', { name: 'receipt.png', mimeType: 'image/png', buffer: await photo(browser, RECEIPT_HTML) });
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId('receipt-thumb').click();
  await page.getByText('Close', { exact: true }).click();
  await page.goto('/audit');
  await expect(page.getByText('Added a receipt photo', { exact: true }).first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Arabic: a receipt photo is added to a payment voucher', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin', 'ar');
  await page.goto('/payments?partnerType=supplier');
  await page.getByText(/^PV\/\d{4}\/\d+ · /).first().click();
  await expect(page.getByText('صور الإيصالات')).toBeVisible();
  await choose(page, 'اختيار صورة', { name: 'receipt.png', mimeType: 'image/png', buffer: await photo(browser, RECEIPT_HTML) });
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(1, { timeout: 60_000 });
  await expectNoErrors(page, errors);
});

test('a picture that is not a receipt is refused for an accountant', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant');
  await page.goto('/moves?type=in_invoice');
  await page.getByText(/^BILL\/\d{4}\/\d+$/).first().click();
  const before = await page.getByTestId('receipt-thumb').count();
  await choose(page, 'Choose Photo', { name: 'picture.png', mimeType: 'image/png', buffer: await photo(browser, PICTURE) });
  await expect(page.getByText('Photo not added')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Ask an administrator to attach a handwritten or faded receipt/)).toBeVisible();
  await page.getByText('OK', { exact: true }).last().click();
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(before);
  await expectNoErrors(page, errors);
});

test('Arabic: an administrator may attach an unreadable photo after confirming, and it is in the audit log', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin', 'ar');
  await page.goto('/moves?type=in_invoice');
  await page.getByText(/^BILL\/\d{4}\/\d+$/).first().click();
  const before = await page.getByTestId('receipt-thumb').count();
  // Cancel: nothing is attached.
  await choose(page, 'اختيار صورة', { name: 'picture.png', mimeType: 'image/png', buffer: await photo(browser, PICTURE) });
  await expect(page.getByText('إرفاقها على أي حال؟')).toBeVisible({ timeout: 60_000 });
  await page.getByText('إلغاء', { exact: true }).last().click();
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(before);
  // Confirm: attached, and recorded.
  await choose(page, 'اختيار صورة', { name: 'picture.png', mimeType: 'image/png', buffer: await photo(browser, PICTURE) });
  await page.getByText('إرفاق على أي حال', { exact: true }).click({ timeout: 60_000 });
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(before + 1);
  await page.goto('/audit');
  await expect(page.getByText('أضاف صورة إيصال لم يتمكن حساب من قراءتها').first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('viewers see receipt photos but cannot add or import', async ({ page }) => {
  await demoSignIn(page, 'owner');
  await page.goto('/moves?type=in_invoice');
  await expect(page.getByText('Import CSV', { exact: true })).toHaveCount(0);
  await page.getByText(/^BILL\/\d{4}\/\d+$/).first().click();
  await expect(page.getByText('Receipt Photos')).toBeVisible();
  await expect(page.getByText('Take Photo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Choose Photo', { exact: true })).toHaveCount(0);
});
