// Import purchase bills and cash expenses from a CSV file (for example saved from Excel).
import { defaultJournal, journalForMoveType, newInvoiceLine, newMove, postMove, registerPayment, saveDraft } from './engine';
import { AppState, ID, Partner, Tax } from './types';
import { isValidISODate, newId, round } from './utils';

/** Columns of the downloadable template, in order. */
export const PURCHASE_IMPORT_COLUMNS = ['date', 'type', 'vendor', 'reference', 'description', 'account', 'amount', 'vat', 'paid_from'] as const;
type Column = (typeof PURCHASE_IMPORT_COLUMNS)[number];

/** Header names accepted for each column (English and Arabic), compared in lower case. */
const HEADERS: Record<Column, string[]> = {
  date: ['date', 'bill date', 'invoice date', 'التاريخ'],
  type: ['type', 'النوع'],
  vendor: ['vendor', 'supplier', 'المورد'],
  reference: ['reference', 'ref', 'bill reference', 'invoice no', 'invoice number', 'المرجع', 'رقم الفاتورة'],
  description: ['description', 'details', 'label', 'البيان', 'الوصف'],
  account: ['account', 'account code', 'الحساب'],
  amount: ['amount', 'amount before vat', 'net amount', 'net', 'المبلغ', 'المبلغ قبل الضريبة'],
  vat: ['vat', 'vat rate', 'tax', 'الضريبة'],
  paid_from: ['paid_from', 'paid from', 'payment', 'دفع من', 'طريقة الدفع'],
};

export interface ImportMessage {
  /** Row number in the file (the header is row 1). */
  row: number;
  message: string;
  params?: Record<string, string | number>;
}

export interface PurchaseImportRow {
  row: number;
  type: 'bill' | 'expense';
  date: string;
  vendorName: string;
  reference: string;
  description: string;
  accountId: ID;
  /** Amount before VAT. */
  amount: number;
  taxId?: ID;
  /** Expenses: bank or cash journal the money was paid from. */
  journalId?: ID;
}

export interface PurchaseImportPlan {
  rows: PurchaseImportRow[];
  errors: ImportMessage[];
}

/** Every message this module can produce, so the Arabic translations can be checked. */
export const PURCHASE_IMPORT_MESSAGES = [
  'The file needs a header row with at least the columns date and amount. Download the template to see the format.',
  'The file has no rows to import.',
  'Invalid date "{value}". Use YYYY-MM-DD or DD/MM/YYYY.',
  'Type must be "bill" or "expense", not "{value}".',
  'Invalid amount "{value}". Enter the amount before VAT, greater than zero.',
  'Unknown VAT rate "{value}". Use 5, 0, exempt or leave it empty.',
  'Account "{value}" was not found. Use an account code from the chart of accounts.',
  'A bill needs a vendor name.',
  'Unknown "paid from" value "{value}". Use cash, bank or the name of a bank or cash journal.',
  'Bill {reference} from {vendor} is already in Hisab.',
] as const;

const norm = (s: string | undefined) => (s ?? '').replace(/^﻿/, '').trim().toLowerCase();

/** Accepts YYYY-MM-DD and day-first dates (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY), as Excel saves them in Oman. */
export function parseImportDate(value: string): string | undefined {
  const v = value.trim();
  if (isValidISODate(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (!m) return undefined;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : undefined;
}

function parseAmount(value: string): number | undefined {
  const cleaned = value.replace(/[,\s]/g, '').replace(/^(OMR|ر\.ع\.?)/i, '').replace(/(OMR|ر\.ع\.?)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return n > 0 ? n : undefined;
}

/** Purchase tax for a VAT cell: empty means no VAT. */
function findTax(state: AppState, value: string): { tax?: Tax; ok: boolean } {
  const v = norm(value).replace(/%/g, '').replace(/^vat\s*/, '').trim();
  if (!v || v === 'none' || v === 'no') return { ok: true };
  const purchase = state.taxes.filter((t) => t.active && t.typeTaxUse === 'purchase' && !t.priceInclude);
  const byCategory = (c: Tax['vatCategory']) => purchase.find((t) => t.vatCategory === c);
  if (['exempt', 'معفى', 'معفاة'].includes(v)) return { tax: byCategory('exempt'), ok: !!byCategory('exempt') };
  if (['reverse', 'reverse charge', 'احتساب عكسي'].includes(v)) return { tax: byCategory('reverse_charge'), ok: !!byCategory('reverse_charge') };
  const rate = Number(v);
  if (!Number.isFinite(rate)) return { ok: false };
  const tax = rate === 0 ? byCategory('zero') : purchase.find((t) => t.vatCategory === 'standard' && t.amountType === 'percent' && t.amount === rate);
  return { tax, ok: !!tax };
}

function findAccount(state: AppState, value: string): ID | undefined {
  const v = norm(value);
  const usable = state.accounts.filter((a) => a.active !== false && a.type !== 'asset_receivable' && a.type !== 'liability_payable');
  return (usable.find((a) => a.code.toLowerCase() === v) ?? usable.find((a) => a.name.toLowerCase() === v))?.id;
}

function findPaidFrom(state: AppState, value: string): ID | undefined {
  const v = norm(value);
  if (!v || ['cash', 'نقد', 'نقدي', 'نقداً'].includes(v)) return defaultJournal(state, 'cash').id;
  if (['bank', 'بنك', 'البنك', 'تحويل'].includes(v)) return defaultJournal(state, 'bank').id;
  return state.journals.find((j) => (j.type === 'cash' || j.type === 'bank') && j.active !== false && j.name.toLowerCase() === v)?.id;
}

/**
 * Read a parsed CSV table (first row = headers) into rows ready to import, with an error for each
 * row that cannot be imported. Nothing is changed.
 */
export function planPurchaseImport(state: AppState, table: string[][]): PurchaseImportPlan {
  const header = (table[0] ?? []).map(norm);
  const col = Object.fromEntries(PURCHASE_IMPORT_COLUMNS.map((c) => [c, header.findIndex((h) => HEADERS[c].includes(h))])) as Record<Column, number>;
  if (col.date < 0 || col.amount < 0) return { rows: [], errors: [{ row: 1, message: PURCHASE_IMPORT_MESSAGES[0] }] };
  const body = table.slice(1);
  if (!body.length) return { rows: [], errors: [{ row: 1, message: PURCHASE_IMPORT_MESSAGES[1] }] };

  const defaultAccount = journalForMoveType(state, 'in_invoice').defaultAccountId;
  const rows: PurchaseImportRow[] = [];
  const errors: ImportMessage[] = [];
  body.forEach((r, i) => {
    const row = i + 2;
    const cell = (c: Column) => (col[c] >= 0 ? (r[col[c]] ?? '').trim() : '');
    const fail = (message: string, params?: Record<string, string | number>) => errors.push({ row, message, params });

    const date = parseImportDate(cell('date'));
    if (!date) return fail(PURCHASE_IMPORT_MESSAGES[2], { value: cell('date') });
    const typeCell = norm(cell('type'));
    const vendorName = cell('vendor');
    let type: PurchaseImportRow['type'];
    if (!typeCell) type = vendorName ? 'bill' : 'expense';
    else if (['bill', 'invoice', 'فاتورة', 'فاتورة مشتريات'].includes(typeCell)) type = 'bill';
    else if (['expense', 'cash expense', 'receipt', 'مصروف', 'مصروف نقدي', 'إيصال'].includes(typeCell)) type = 'expense';
    else return fail(PURCHASE_IMPORT_MESSAGES[3], { value: cell('type') });
    const amount = parseAmount(cell('amount'));
    if (amount === undefined) return fail(PURCHASE_IMPORT_MESSAGES[4], { value: cell('amount') });
    const vat = findTax(state, cell('vat'));
    if (!vat.ok) return fail(PURCHASE_IMPORT_MESSAGES[5], { value: cell('vat') });
    const accountId = cell('account') ? findAccount(state, cell('account')) : defaultAccount;
    if (!accountId) return fail(PURCHASE_IMPORT_MESSAGES[6], { value: cell('account') });
    if (type === 'bill' && !vendorName) return fail(PURCHASE_IMPORT_MESSAGES[7]);
    let journalId: ID | undefined;
    if (type === 'expense') {
      journalId = findPaidFrom(state, cell('paid_from'));
      if (!journalId) return fail(PURCHASE_IMPORT_MESSAGES[8], { value: cell('paid_from') });
    }
    const reference = cell('reference');
    if (type === 'bill' && reference) {
      const vendor = state.partners.find((p) => p.name.trim().toLowerCase() === vendorName.toLowerCase());
      const known = vendor && state.moves.some((m) => m.moveType === 'in_invoice' && m.partnerId === vendor.id && m.state !== 'cancel' && m.ref.trim().toLowerCase() === reference.toLowerCase());
      const twice = rows.some((x) => x.type === 'bill' && x.vendorName.toLowerCase() === vendorName.toLowerCase() && x.reference.toLowerCase() === reference.toLowerCase());
      if (known || twice) return fail(PURCHASE_IMPORT_MESSAGES[9], { reference, vendor: vendorName });
    }
    rows.push({ row, type, date, vendorName, reference, description: cell('description'), accountId, amount, taxId: vat.tax?.id, journalId });
  });
  return { rows, errors };
}

export interface PurchaseImportResult {
  state: AppState;
  bills: number;
  expenses: number;
  /** Rows the engine refused (for example a date inside a locked period). */
  errors: ImportMessage[];
}

/** Find a vendor by name, or add one. */
function vendorFor(state: AppState, name: string): { state: AppState; id?: ID } {
  if (!name) return { state };
  const existing = state.partners.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return { state, id: existing.id };
  const partner: Partner = { id: newId(), name, email: '', phone: '', street: '', city: '', country: state.settings.country, taxId: '', isCustomer: false, isVendor: true, notes: '', active: true };
  return { state: { ...state, partners: [...state.partners, partner] }, id: partner.id };
}

/** Post the planned rows: bills are confirmed (numbered), expenses become payment vouchers. */
export function importPurchases(state: AppState, rows: PurchaseImportRow[]): PurchaseImportResult {
  const { decimals } = state.settings;
  let next = state;
  let bills = 0;
  let expenses = 0;
  const errors: ImportMessage[] = [];
  for (const r of rows) {
    try {
      const vendor = vendorFor(next, r.vendorName);
      let s = vendor.state;
      if (r.type === 'bill') {
        const partner = s.partners.find((p) => p.id === vendor.id);
        const move = newMove(s, 'in_invoice', {
          partnerId: vendor.id,
          date: r.date,
          invoiceDate: r.date,
          ref: r.reference,
          paymentTermId: partner?.paymentTermId ?? s.settings.defaultPaymentTermId,
          invoiceLines: [newInvoiceLine({ label: r.description || r.reference || 'Imported bill', priceUnit: r.amount, taxIds: r.taxId ? [r.taxId] : [], accountId: r.accountId })],
        });
        s = postMove(saveDraft(s, move), move.id);
        bills++;
      } else {
        const tax = r.taxId ? s.taxes.find((t) => t.id === r.taxId) : undefined;
        const vat = tax && tax.amountType === 'percent' && !tax.reverseCharge ? round((r.amount * tax.amount) / 100, decimals) : 0;
        s = registerPayment(s, {
          paymentType: 'outbound',
          partnerType: 'other',
          partnerId: vendor.id,
          amount: round(r.amount + vat, decimals),
          date: r.date,
          journalId: r.journalId!,
          memo: [r.reference, r.description].filter(Boolean).join(' · '),
          counterpartAccountId: r.accountId,
          taxId: r.taxId,
        }).state;
        expenses++;
      }
      next = s;
    } catch (e) {
      errors.push({ row: r.row, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { state: next, bills, expenses, errors };
}

/** Header and example rows for the downloadable template. */
export function purchaseTemplateRows(): string[][] {
  return [
    [...PURCHASE_IMPORT_COLUMNS],
    ['2026-11-01', 'bill', 'Muscat Office Supplies LLC', 'INV-4521', 'Printer paper and toner', '', '120.000', '5', ''],
    ['2026-11-02', 'bill', 'Al Noor Rent', 'R-11/2026', 'Office rent November', '', '450.000', 'exempt', ''],
    ['2026-11-03', 'expense', 'Shell Bausher', '', 'Fuel', '', '15.000', '5', 'cash'],
    ['2026-11-04', 'expense', '', '', 'Bank charges', '', '2.500', '', 'bank'],
  ];
}
