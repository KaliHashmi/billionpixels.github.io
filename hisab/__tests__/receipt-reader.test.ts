import { invoiceStatus, postMove, saveDraft } from '../src/domain/engine';
import { classifyDocument, draftBillFromReading, isAccountingDocument, normaliseText, readReceipt, RECEIPT_MESSAGES, suggestAccount, vendorDefaults } from '../src/domain/receiptReader';
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

describe('where a scanned paper goes', () => {
  const s = company();
  const kind = (text: string) => classifyDocument(text, readReceipt(s, text));
  it('a supplier tax invoice becomes a purchase bill', () => expect(kind(ENGLISH)).toBe('bill'));
  it('a credit note becomes a vendor credit note, with its number', () => {
    const text = 'Muscat Office Supplies LLC\nVATIN OM1100012345\nCREDIT NOTE\nCredit Note No: CN-12\nTotal 10.500';
    expect(kind(text)).toBe('credit');
    expect(readReceipt(s, text).reference).toBe('CN-12');
  });
  it('Arabic: إشعار دائن becomes a vendor credit note', () => expect(kind('مؤسسة النور\nإشعار دائن رقم ٥\nالإجمالي ١٠٫٥٠٠')).toBe('credit'));
  it('a till receipt becomes a cash expense', () => expect(kind('SHELL BAUSHER\nReceipt # 55102\nTOTAL OMR 15.750\nThank you')).toBe('expense'));
  it('a paper with no invoice and no VAT number becomes a cash expense', () => expect(kind('Taxi Muscat\n08/11/2026\nTotal 5.000')).toBe('expense'));
});

it('suggests the account booked last time for this vendor, else one from keywords', () => {
  let s = company();
  const office = s.accounts.find((a) => a.code === '615000')!;
  const fuel = s.accounts.find((a) => a.code === '618000')!;
  const rent = s.accounts.find((a) => a.code === '612000')!;
  expect(suggestAccount(s, 'SHELL BAUSHER\nUnleaded 91')).toBe(fuel.id);
  expect(suggestAccount(s, 'إيجار المكتب لشهر نوفمبر')).toBe(rent.id);
  expect(suggestAccount(s, 'Something else')).toBeUndefined();
  // After a bill from this vendor is booked to Office Supplies, the next scan uses it.
  const draft = draftBillFromReading(s, readReceipt(s, ENGLISH), '2026-11-08', 'Paper', { accountId: office.id });
  s = postMove(saveDraft(s, draft), draft.id);
  expect(vendorDefaults(s, 'v1').accountId).toBe(office.id);
  expect(suggestAccount(s, 'fuel', 'v1')).toBe(office.id);
});

it('makes a vendor credit note when the paper is one', () => {
  const s = company();
  const draft = draftBillFromReading(s, readReceipt(s, ENGLISH), '2026-11-08', 'Return', { kind: 'credit' });
  expect(draft.moveType).toBe('in_refund');
});

describe('only accounting documents are accepted', () => {
  const s = company();
  const ok = (text: string) => isAccountingDocument(text, readReceipt(s, text));
  it('accepts a tax invoice, a credit note and a till receipt, in English and Arabic', () => {
    expect(ok(ENGLISH)).toBe(true);
    expect(ok('مؤسسة النور\nإشعار دائن رقم ٥\nالإجمالي ١٠٫٥٠٠')).toBe(true);
    expect(ok('SHELL BAUSHER\nReceipt # 55102\nTOTAL OMR 15.750')).toBe(true);
    expect(ok('Taxi Muscat\n08/11/2026\nTotal 5.000')).toBe(true);
  });
  it('refuses text with no total: a letter, a photo of a person, a page of a book', () => {
    expect(ok('Dear Ahmed,\nThank you for your visit to our office last week.\nKind regards')).toBe(false);
    expect(ok('~ ,. il1 | :; Ww mm\n.. ,,')).toBe(false);
    expect(ok('الفصل الأول\nكان يا ما كان في قديم الزمان\nصفحة 12')).toBe(false);
  });
  it('refuses a total of nothing', () => expect(ok('Score sheet\nTotal 0')).toBe(false));
});
