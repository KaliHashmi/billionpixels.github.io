import { Browser, expect, Page, test } from '@playwright/test';
import { demoSignIn, expectNoErrors, photo, RECEIPT_HTML as RECEIPT, signIn, watchErrors } from './helpers';

// The tests run in Node, but the project's TypeScript settings have no Node types.
declare const Buffer: { from(data: string): Uint8Array };

// Supplier documents made on the fly: Chromium prints real PDFs (with text) and takes photos (screenshots).
const CSS = 'body{font-family:Arial,sans-serif;padding:40px;font-size:16px}';
const EN = `<h1>Gulf Paper Trading LLC</h1><p>VATIN: OM1100024680</p><h2>TAX INVOICE</h2><p>Invoice No: GP-3301<br>Invoice Date: 04/11/2026</p>
<p>Printer paper A4 10 x 12.000 = 120.000<br>Toner 1 x 80.000 = 80.000</p><p>Subtotal 200.000<br>VAT 5% 10.000<br><b>Total (incl. VAT) OMR 210.000</b></p>`;
const AR = `<div dir="rtl"><h1>مؤسسة النور للتجارة</h1><p>الرقم الضريبي: OM1100055555</p><h2>فاتورة ضريبية</h2><p>رقم الفاتورة: 789<br>التاريخ: 15/11/2026</p>
<p>الإجمالي قبل الضريبة 200.000<br>ضريبة القيمة المضافة 5% 10.000<br><b>الإجمالي شامل الضريبة 210.000</b></p></div>`;

async function pdf(browser: Browser, html: string) {
  const p = await browser.newPage();
  await p.setContent(`<style>${CSS}</style>${html}`);
  const data = await p.pdf({ format: 'A4' });
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

test('a damaged file or a blank picture is reported as unreadable, and the other files are still read', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload PDF / Photo', { exact: true }).first().click();
  await (await chooser).setFiles([
    { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 this is not really a PDF') },
    { name: 'blank.png', mimeType: 'image/png', buffer: await photo(browser, '<div style="width:300px;height:200px"></div>') },
    { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, EN) },
  ]);
  await expect(page.getByText('Could not read', { exact: true }).filter({ visible: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(page.getByText(/Use a PDF, JPG or PNG that is not password-protected/)).toBeVisible();
  await expect(page.getByText(/No text could be read from this file/)).toBeVisible();
  await expect(page.getByText(/Purchase bill · GP-3301/)).toBeVisible();
  await expect(page.getByText('To check', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expectNoErrors(page, errors);
});

test('Arabic: a credit note and a receipt uploaded together; the receipt is confirmed as a cash expense', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant', 'ar');
  const credit = '<div dir="rtl"><h1>مؤسسة النور للتجارة</h1><p>الرقم الضريبي: OM1100055555</p><h2>إشعار دائن</h2><p>رقم الإشعار: 15<br>التاريخ: 07/11/2026</p><p>الإجمالي قبل الضريبة 20.000<br>ضريبة القيمة المضافة 5% 1.000<br><b>الإجمالي شامل الضريبة 21.000</b></p></div>';
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('رفع PDF / صورة', { exact: true }).first().click();
  await (await chooser).setFiles([
    { name: 'إشعار.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, credit) },
    { name: 'إيصال.png', mimeType: 'image/png', buffer: await photo(browser, RECEIPT) },
  ]);
  await expect(page.getByText('المستندات الممسوحة').first()).toBeVisible();
  await expect(page.getByText('بانتظار المراجعة', { exact: true }).filter({ visible: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(page.getByText(/إشعار دائن من مورد · 15/)).toBeVisible();
  await page.getByText(/مصروف نقدي · 55102/).filter({ visible: true }).first().click();
  await expect(page.getByText(/مصروف نقدي دُفع في الحال/)).toBeVisible();
  await expect(page.getByText('618000 الوقود والنقل').filter({ visible: true })).toBeVisible();
  await page.getByText('تأكيد', { exact: true }).filter({ visible: true }).last().click();
  await expect(page.getByText(/^PV\/\d{4}\/\d+$/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId('receipt-thumb')).toHaveCount(1);
  // Back on the list (in the app, not a page reload), the receipt now shows as saved.
  await page.goBack();
  await expect(page.getByText('تم الحفظ', { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expectNoErrors(page, errors);
});

test('signing out forgets the scanned list', async ({ page, browser }) => {
  await demoSignIn(page, 'admin');
  await upload(page, 'Upload PDF / Photo', { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, EN) });
  await expect(page.getByText('Read from the document')).toBeVisible({ timeout: 60_000 });
  await page.goto('/account');
  await page.getByText('Sign out', { exact: true }).click();
  await signIn(page, 'admin');
  await page.goto('/scan');
  await expect(page.getByText('Nothing scanned yet')).toBeVisible();
});

// Not accounting papers: a letter and a birthday card, as a PDF and a photo.
const LETTER = '<p>Dear Ahmed,</p><p>Thank you for visiting our office last week. We enjoyed meeting your family and hope to see you again soon.</p><p>Kind regards,<br>Salim</p>';
const CARD = '<div style="font-size:40px;font-family:Georgia,serif;color:#a33">Happy Birthday Sara!</div><div style="margin-top:20px;width:120px;height:120px;border-radius:60px;background:#f2c94c"></div>';

test('a file that is not a bill, receipt or credit note is refused and nothing is kept', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'admin');
  await page.goto('/moves?type=in_invoice');
  const drafts = page.getByText(/^Draft/).filter({ visible: true });
  await expect(page.getByText(/^BILL\//).filter({ visible: true }).first()).toBeVisible();
  const before = await drafts.count();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Upload PDF / Photo', { exact: true }).first().click();
  await (await chooser).setFiles([
    { name: 'letter.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, LETTER) },
    { name: 'card.png', mimeType: 'image/png', buffer: await photo(browser, CARD) },
  ]);
  await expect(page.getByText('Could not read', { exact: true }).filter({ visible: true })).toHaveCount(2, { timeout: 90_000 });
  await expect(page.getByText(/This doesn't look like a bill, receipt or credit note/).filter({ visible: true })).toHaveCount(2);
  await expect(page.getByText('To check', { exact: true })).toHaveCount(0);
  // No draft was made from them.
  await page.goto('/moves?type=in_invoice');
  await expect(page.getByText(/^BILL\//).filter({ visible: true }).first()).toBeVisible();
  await expect(drafts).toHaveCount(before);
  await expectNoErrors(page, errors);
});

test('Arabic: a letter is refused as not an accounting document', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await demoSignIn(page, 'accountant', 'ar');
  await upload(page, 'رفع PDF / صورة', { name: 'رسالة.pdf', mimeType: 'application/pdf', buffer: await pdf(browser, '<div dir="rtl"><p>عزيزي أحمد،</p><p>شكراً لزيارتك مكتبنا الأسبوع الماضي، ونتمنى رؤيتك قريباً.</p><p>مع التحية، سالم</p></div>') });
  await expect(page.getByText('تعذّرت القراءة', { exact: true }).filter({ visible: true })).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByText(/لا يبدو أن هذا المستند فاتورة أو إيصال أو إشعار دائن/)).toBeVisible();
  await expectNoErrors(page, errors);
});
