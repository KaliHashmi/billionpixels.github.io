import { Browser, expect, Page, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, watchErrors } from './helpers';

// Supplier documents made on the fly: Chromium prints real PDFs (with text) and takes photos (screenshots).
const CSS = 'body{font-family:Arial,sans-serif;padding:40px;font-size:16px}';
const EN = `<h1>Gulf Paper Trading LLC</h1><p>VATIN: OM1100024680</p><h2>TAX INVOICE</h2><p>Invoice No: GP-3301<br>Invoice Date: 04/11/2026</p>
<p>Printer paper A4 10 x 12.000 = 120.000<br>Toner 1 x 80.000 = 80.000</p><p>Subtotal 200.000<br>VAT 5% 10.000<br><b>Total (incl. VAT) OMR 210.000</b></p>`;
const AR = `<div dir="rtl"><h1>مؤسسة النور للتجارة</h1><p>الرقم الضريبي: OM1100055555</p><h2>فاتورة ضريبية</h2><p>رقم الفاتورة: 789<br>التاريخ: 15/11/2026</p>
<p>الإجمالي قبل الضريبة 200.000<br>ضريبة القيمة المضافة 5% 10.000<br><b>الإجمالي شامل الضريبة 210.000</b></p></div>`;
const RECEIPT = `<div style="width:420px;font-family:'Courier New',monospace;font-size:24px;line-height:1.5">SHELL BAUSHER<br>Receipt # 55102<br>08-11-2026 14:22<br>Unleaded 91<br>TOTAL OMR 15.750<br>Prices include VAT 5%</div>`;

async function pdf(browser: Browser, html: string) {
  const p = await browser.newPage();
  await p.setContent(`<style>${CSS}</style>${html}`);
  const data = await p.pdf({ format: 'A4' });
  await p.close();
  return data;
}

async function photo(browser: Browser, html: string) {
  const p = await browser.newPage({ viewport: { width: 520, height: 420 } });
  await p.setContent(`<body style="margin:0;padding:40px;background:#fff">${html}</body>`);
  const data = await p.screenshot();
  await p.close();
  return data;
}

async function upload(page: Page, label: string, file: { name: string; mimeType: string; buffer: Uint8Array }) {
  await page.goto('/moves?type=in_invoice');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText(label, { exact: true }).click();
  await (await chooser).setFiles(file);
}

test('an English PDF invoice becomes a draft bill with the vendor, number, date and VAT filled in', async ({ page, browser }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await upload(page, 'Upload PDF / Photo', { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, EN) });
  await expect(page.getByText('Read from the document')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Total on the paper')).toBeVisible();
  await expect(page.getByText('OMR 210.000').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByLabel('Bill Reference')).toHaveValue('GP-3301');
  await expect(page.getByLabel('Bill Date')).toHaveValue('2026-11-04');
  // A new vendor: one tap creates it with the VAT number from the paper.
  await page.getByText('Create vendor "Gulf Paper Trading LLC"').click();
  await expect(page.getByText('Vendor VATIN')).toBeVisible();
  await expect(page.getByText('OM1100024680')).toBeVisible();
  // The PDF's first page is kept as the receipt photo.
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(1);
  await page.getByText('Confirm', { exact: true }).first().click();
  await expect(page.getByText(/^BILL\/\d{4}\/\d+$/).filter({ visible: true }).first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Arabic: an Arabic PDF invoice is read in Arabic', async ({ page, browser }) => {
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant', 'ar');
  await upload(page, 'رفع PDF / صورة', { name: 'فاتورة.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, AR) });
  await expect(page.getByText('تمت القراءة من المستند')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('الإجمالي في الورقة')).toBeVisible();
  await expect(page.getByLabel('مرجع فاتورة المورد')).toHaveValue('789');
  await expect(page.getByText(/مؤسسة النور للتجارة/).filter({ visible: true }).first()).toBeVisible();
  await expectNoErrors(page, errors);
});

test('a photo of a till receipt is recognised on the device and becomes a cash expense', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await upload(page, 'Upload PDF / Photo', { name: 'receipt.png', mimeType: 'image/png', buffer: await photo(browser, RECEIPT) });
  await expect(page.getByText('A cash expense paid on the spot.', { exact: false })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('OMR 15.750').filter({ visible: true }).first()).toBeVisible();
  // Fuel, from the words on the receipt; amount, date and VAT from the paper.
  await expect(page.getByText('618000 Fuel & Transport').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel('Amount')).toHaveValue(/15\.75/);
  await page.getByText('Confirm', { exact: true }).filter({ visible: true }).last().click();
  await expect(page.getByText(/^PV\/\d{4}\/\d+$/).filter({ visible: true }).first()).toBeVisible();
  // The receipt is kept with the voucher.
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(1);
  await expectNoErrors(page, errors);
});

test('several files at once are read, sorted into bill, credit note and expense, and listed for review', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  const credit = '<h1>Gulf Paper Trading LLC</h1><p>VATIN: OM1100024680</p><h2>CREDIT NOTE</h2><p>Credit Note No: CN-0042<br>Date: 06/11/2026</p><p>Subtotal 40.000<br>VAT 5% 2.000<br><b>Total OMR 42.000</b></p>';
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload PDF / Photo', { exact: true }).first().click();
  await (await chooser).setFiles([
    { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, EN) },
    { name: 'credit.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, credit) },
    { name: 'receipt.png', mimeType: 'image/png', buffer: await photo(browser, RECEIPT) },
  ]);
  await expect(page.getByText('Scanned Documents').first()).toBeVisible();
  await expect(page.getByText('To check').filter({ visible: true })).toHaveCount(3, { timeout: 90_000 });
  await expect(page.getByText(/Purchase bill · GP-3301/)).toBeVisible();
  await expect(page.getByText(/Vendor credit note · CN-0042/)).toBeVisible();
  await expect(page.getByText(/Cash expense/)).toBeVisible();

  // Open the bill and change it to a credit note with one tap: the same draft, another document type.
  await page.getByText(/Purchase bill · GP-3301/).click();
  await page.getByText('Vendor credit note', { exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Draft Vendor Credit Note').filter({ visible: true })).toBeVisible();
  // And to a cash expense: the draft goes, the form opens pre-filled.
  await page.getByText('Cash expense', { exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('A cash expense paid on the spot.', { exact: false })).toBeVisible();
  await expectNoErrors(page, errors);
});

test('Arabic: the Dashboard offers scanning and upload', async ({ page }) => {
  await demoSignIn(page, 'accountant', 'ar');
  await expect(page.getByText('مسح أو رفع مستند')).toBeVisible();
  await expect(page.getByText('مسح ورقة', { exact: true })).toBeVisible();
  await expect(page.getByText('رفع PDF / صورة', { exact: true })).toBeVisible();
});

test('viewers cannot scan', async ({ page }) => {
  await demoSignIn(page, 'owner');
  await page.goto('/moves?type=in_invoice');
  await expect(page.getByText('Upload PDF / Photo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Scan Paper', { exact: true })).toHaveCount(0);
});
