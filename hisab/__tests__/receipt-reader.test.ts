import { invoiceStatus, postMove, saveDraft } from '../src/domain/engine';
import { draftBillFromReading, normaliseText, readReceipt, RECEIPT_MESSAGES } from '../src/domain/receiptReader';
import { createCompany } from '../src/domain/template';
import { Partner } from '../src/domain/types';
import { hasTranslation } from '../src/i18n/translate';

function company() {
  const s = createCompany({ companyName: 'Muscat Co', currency: 'OMR', vatRate: 5, country: 'OM' });
  const vendor: Partner = { id: 'v1', name: 'Muscat Office Supplies LLC', email: '', phone: '', street: '', city: '', country: 'OM', taxId: 'OM1100012345', isCustomer: false, isVendor: true, notes: '', active: true };
  return { ...s, settings: { ...s.settings, companyTaxId: 'OM1100099999' }, partners: [vendor] };
}

const ENGLISH = `Muscat Office Supplies LLC
Al Khuwair, Muscat  Tel +968 24123456
VATIN: OM1100012345
TAX INVOICE
Invoice No: INV-4521
Invoice Date: 03/11/2026
Bill to: Muscat Co  VATIN OM1100099999
Printer paper A4   10   12.000   120.000
Subtotal 120.000
VAT 5% 6.000
Total (incl. VAT) OMR 126.000`;

it('reads an English tax invoice and recognises the vendor by VAT number', () => {
  const s = company();
  const r = readReceipt(s, ENGLISH);
  expect(r).toMatchObject({ vendorId: 'v1', vatin: 'OM1100012345', reference: 'INV-4521', date: '2026-11-03', net: 120, vat: 6, total: 126, rate: 5 });
  expect(r.taxId).toBe(s.taxes.find((t) => t.typeTaxUse === 'purchase' && t.vatCategory === 'standard')!.id);
  expect(r.warnings).toEqual([]);
});

it('reads an Arabic invoice with Arabic-Indic digits', () => {
  const s = company();
  const text = `مؤسسة النور للتجارة
الرقم الضريبي: OM١١٠٠٠٥٥٥٥٥
فاتورة ضريبية
رقم الفاتورة: ٧٨٩
التاريخ: ١٥ نوفمبر ٢٠٢٦
الإجمالي قبل الضريبة ٢٠٠٫٠٠٠
ضريبة القيمة المضافة ٥٪ ١٠٫٠٠٠
الإجمالي شامل الضريبة ٢١٠٫٠٠٠`;
  const r = readReceipt(s, text);
  expect(r).toMatchObject({ vatin: 'OM1100055555', reference: '789', date: '2026-11-15', net: 200, vat: 10, total: 210, rate: 5 });
  expect(r.vendorId).toBeUndefined();
  expect(r.vendorGuess).toBe('مؤسسة النور للتجارة');
  expect(r.warnings.map((w) => w.message)).toEqual([RECEIPT_MESSAGES.vendorGuess]);
});

it('works out net and VAT from a till receipt that shows only the total and the rate', () => {
  const r = readReceipt(company(), 'SHELL BAUSHER\nReceipt # 55102\n08-11-2026 14:22\nUnleaded 91\nTOTAL OMR 15.750\nPrices include VAT 5%');
  expect(r).toMatchObject({ reference: '55102', date: '2026-11-08', total: 15.75, net: 15, vat: 0.75, rate: 5 });
});

it('flags a paper whose amounts do not add up', () => {
  const r = readReceipt(company(), 'Muscat Office Supplies LLC\nInvoice No: A-1\nDate 01/11/2026\nSubtotal 100.000\nVAT 5.000\nGrand Total 106.000');
  expect(r.warnings.map((w) => w.message)).toContain(RECEIPT_MESSAGES.mismatch);
});

it('says so when no text could be read', () => {
  expect(readReceipt(company(), '  \n ').warnings.map((w) => w.message)).toEqual([RECEIPT_MESSAGES.noText]);
});

it('turns the reading into a draft bill that Hisab recalculates', () => {
  const s = company();
  const draft = draftBillFromReading(s, readReceipt(s, ENGLISH), '2026-11-08', 'Purchase as per supplier invoice');
  expect(draft).toMatchObject({ moveType: 'in_invoice', state: 'draft', partnerId: 'v1', ref: 'INV-4521', date: '2026-11-03' });
  const posted = postMove(saveDraft(s, draft), draft.id);
  expect(invoiceStatus(posted, posted.moves.find((m) => m.id === draft.id)!).total).toBe(126);
});

it('normalises Arabic separators', () => {
  expect(normaliseText('١٬٢٥٠٫٥٠٠')).toBe('1,250.500');
  expect(normaliseText('اإلجمالي')).toBe('الإجمالي');
});

it('has an Arabic translation for every reader message', () => {
  expect(Object.values(RECEIPT_MESSAGES).filter((m) => !hasTranslation(m))).toEqual([]);
});
