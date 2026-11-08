import { invoiceStatus } from '../src/domain/engine';
import { vatReturn } from '../src/domain/management';
import { importPurchases, parseImportDate, planPurchaseImport, PURCHASE_IMPORT_MESSAGES, purchaseTemplateRows } from '../src/domain/purchaseImport';
import { createCompany } from '../src/domain/template';
import { hasTranslation } from '../src/i18n/translate';
import { parseCsv, toCsv } from '../src/services/files';

function company() {
  return createCompany({ companyName: 'Muscat Co', currency: 'OMR', vatRate: 5, country: 'OM' });
}

const HEADER = 'date,type,vendor,reference,description,account,amount,vat,paid_from';

it('reads dates the way Excel saves them in Oman', () => {
  expect(parseImportDate('2026-11-03')).toBe('2026-11-03');
  expect(parseImportDate('3/11/2026')).toBe('2026-11-03');
  expect(parseImportDate('03-11-2026')).toBe('2026-11-03');
  expect(parseImportDate('31/02/2026')).toBeUndefined();
  expect(parseImportDate('11/2026')).toBeUndefined();
});

it('imports the template: bills are confirmed with VAT, expenses become payment vouchers', () => {
  const s = company();
  const plan = planPurchaseImport(s, parseCsv(toCsv(purchaseTemplateRows())));
  expect(plan.errors).toEqual([]);
  expect(plan.rows.map((r) => r.type)).toEqual(['bill', 'bill', 'expense', 'expense']);

  const res = importPurchases(s, plan.rows);
  expect(res.errors).toEqual([]);
  expect(res.bills).toBe(2);
  expect(res.expenses).toBe(2);

  const bills = res.state.moves.filter((m) => m.moveType === 'in_invoice');
  expect(bills.every((m) => m.state === 'posted' && m.name.startsWith('BILL/'))).toBe(true);
  const paper = bills.find((m) => m.ref === 'INV-4521')!;
  expect(invoiceStatus(res.state, paper).total).toBe(126);
  // New vendors are created once and reused.
  expect(res.state.partners.filter((p) => p.name === 'Muscat Office Supplies LLC')).toHaveLength(1);

  const fuel = res.state.payments.find((p) => p.memo === 'Fuel')!;
  expect(fuel.amount).toBe(15.75);
  expect(res.state.journals.find((j) => j.id === fuel.journalId)!.type).toBe('cash');
  const charges = res.state.payments.find((p) => p.memo === 'Bank charges')!;
  expect(res.state.journals.find((j) => j.id === charges.journalId)!.type).toBe('bank');
  expect(charges.taxId).toBeUndefined();

  // Input VAT of the bill (6.000) and the fuel receipt (0.750) reaches the VAT return.
  const v = vatReturn(res.state, '2026-11-01', '2026-11-30');
  expect(v.inputVat).toBe(6.75);
});

it('accepts Arabic headers and values', () => {
  const s = company();
  const csv = 'التاريخ,النوع,المورد,المبلغ,الضريبة\n05/11/2026,فاتورة,مؤسسة النور,100,5\n06/11/2026,مصروف,,10,معفى';
  const plan = planPurchaseImport(s, parseCsv(csv));
  expect(plan.errors).toEqual([]);
  expect(plan.rows.map((r) => [r.type, r.date])).toEqual([['bill', '2026-11-05'], ['expense', '2026-11-06']]);
});

it('lists each bad row with the reason and keeps the good rows', () => {
  const s = company();
  const csv = [
    HEADER,
    '2026-11-01,bill,Vendor A,A1,Paper,,10,5,',
    '2026-13-01,bill,Vendor A,A2,Paper,,10,5,',
    '2026-11-01,bill,,A3,Paper,,10,5,',
    '2026-11-01,bill,Vendor A,A4,Paper,,-10,5,',
    '2026-11-01,bill,Vendor A,A5,Paper,,10,7,',
    '2026-11-01,bill,Vendor A,A6,Paper,NO-SUCH,10,5,',
    '2026-11-01,expense,,,Taxi,,5,,wallet',
    '2026-11-01,refund,Vendor A,A8,Paper,,10,5,',
    '2026-11-01,bill,Vendor A,A1,Same bill twice,,10,5,',
  ].join('\n');
  const plan = planPurchaseImport(s, parseCsv(csv));
  expect(plan.rows.map((r) => r.row)).toEqual([2]);
  expect(plan.errors.map((e) => [e.row, e.message])).toEqual([
    [3, PURCHASE_IMPORT_MESSAGES[2]],
    [4, PURCHASE_IMPORT_MESSAGES[7]],
    [5, PURCHASE_IMPORT_MESSAGES[4]],
    [6, PURCHASE_IMPORT_MESSAGES[5]],
    [7, PURCHASE_IMPORT_MESSAGES[6]],
    [8, PURCHASE_IMPORT_MESSAGES[8]],
    [9, PURCHASE_IMPORT_MESSAGES[3]],
    [10, PURCHASE_IMPORT_MESSAGES[9]],
  ]);
});

it('does not import a bill that is already in the books', () => {
  const s = company();
  const csv = `${HEADER}\n2026-11-01,bill,Vendor A,A1,Paper,,10,5,`;
  const first = importPurchases(s, planPurchaseImport(s, parseCsv(csv)).rows).state;
  const again = planPurchaseImport(first, parseCsv(csv));
  expect(again.rows).toEqual([]);
  expect(again.errors[0].message).toBe(PURCHASE_IMPORT_MESSAGES[9]);
});

it('refuses a file without the required columns', () => {
  const plan = planPurchaseImport(company(), parseCsv('when,how much\n2026-11-01,10'));
  expect(plan.errors).toEqual([{ row: 1, message: PURCHASE_IMPORT_MESSAGES[0] }]);
});

it('reports rows the books refuse, such as a locked period, and imports the rest', () => {
  let s = company();
  s = { ...s, settings: { ...s.settings, lockDate: '2026-10-31' } };
  const csv = `${HEADER}\n2026-10-15,bill,Vendor A,A1,Paper,,10,5,\n2026-11-15,bill,Vendor A,A2,Paper,,10,5,`;
  const res = importPurchases(s, planPurchaseImport(s, parseCsv(csv)).rows);
  expect(res.bills).toBe(1);
  expect(res.errors.map((e) => e.row)).toEqual([2]);
});

it('has an Arabic translation for every import message', () => {
  expect(PURCHASE_IMPORT_MESSAGES.filter((m) => !hasTranslation(m))).toEqual([]);
});
