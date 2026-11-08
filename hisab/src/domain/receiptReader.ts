// Read a supplier invoice or receipt from its text (taken from a PDF or recognised from a photo)
// and turn it into a draft purchase bill for the user to check. Pure: no I/O, no AI service.
import { newInvoiceLine, newMove } from './engine';
import { AppState, ID, Move, Partner } from './types';
import { isValidISODate, newId, round } from './utils';

export interface ReceiptReading {
  /** Vendor recognised by VAT number or name. */
  vendorId?: ID;
  /** Best guess at the vendor's name when it is not in Hisab yet. */
  vendorGuess?: string;
  vatin?: string;
  reference?: string;
  date?: string;
  /** Amount before VAT. */
  net?: number;
  vat?: number;
  /** Total printed on the paper (including VAT). */
  total?: number;
  /** VAT rate in percent, when it could be worked out. */
  rate?: number;
  /** Purchase tax matching the rate. */
  taxId?: ID;
  /** Messages for the user, in English (translated on screen). */
  warnings: { message: string; params?: Record<string, string | number> }[];
}

export const RECEIPT_MESSAGES = {
  noText: 'No text could be read from this file. Try a clearer photo or a PDF.',
  noTotal: 'No total was found. Enter the amounts from the paper.',
  noDate: 'No date was found. Check the bill date.',
  noReference: 'No invoice number was found. Check the bill reference.',
  noVendor: 'The vendor was not recognised. Choose or create the vendor.',
  vendorGuess: 'The vendor was not recognised (the paper shows "{name}"). Choose or create the vendor.',
  noVat: 'No VAT was found on the paper. Check whether VAT applies.',
  mismatch: 'The amounts on the paper do not add up: {net} + VAT {vat} is not {total}. Check the paper.',
  notAccounting: "This doesn't look like a bill, receipt or credit note. Only accounting documents can be added.",
} as const;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Western digits and separators, so Arabic-Indic numbers can be read. */
export function normaliseText(text: string): string {
  return text
    .normalize('NFKC')
    // PDFs often store the lam-alef ligature in visual order: "اإلجمالي" for "الإجمالي".
    .replace(/ا([إأآ])ل/g, 'ال$1')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬،](?=\d{3}\b)/g, ',')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

const iso = (y: number, m: number, d: number) => {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(s) ? s : undefined;
};

/** Dates in a line: 05/11/2026, 05-11-2026, 2026-11-05, 5 Nov 2026, 5 نوفمبر 2026 (day first, as in Oman). */
function datesIn(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const d = iso(+m[1], +m[2], +m[3]);
    if (d) out.push(d);
  }
  for (const m of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = iso(y, +m[2], +m[1]);
    if (d) out.push(d);
  }
  for (const m of line.matchAll(/(\d{1,2})\s*[- ]?\s*([A-Za-z]{3,9}|[؀-ۿ]{3,7})\s*[- ,]?\s*(\d{4})/g)) {
    const month = MONTHS[m[2].toLowerCase().slice(0, /[A-Za-z]/.test(m[2]) ? 3 : undefined)];
    const d = month ? iso(+m[3], month, +m[1]) : undefined;
    if (d) out.push(d);
  }
  return out;
}

/** Money amounts in a line, ignoring dates, percentages, VAT numbers and phone numbers. */
function amountsIn(line: string): number[] {
  const clean = line
    .replace(/\bOM\s?\d{10}\b/gi, ' ')
    .replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/\d+(\.\d+)?\s*%/g, ' ')
    .replace(/\+?\d{8,}/g, ' ');
  const out: number[] = [];
  for (const m of clean.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,3})?(?![\w])/g)) {
    out.push(Number(m[1].replace(/,/g, '') + (m[2] ?? '')));
  }
  return out;
}

const has = (line: string, words: RegExp) => words.test(line);
const TOTAL = /grand\s*total|total\s*(amount|due|payable|incl|inc\.|with)|amount\s*(due|payable)|net\s*payable|balance\s*due|^\s*total\b|الإجمالي|الاجمالي|المجموع\s*الكلي|المبلغ\s*الإجمالي|إجمالي\s*المبلغ|المبلغ\s*المستحق|الصافي\s*المستحق/i;
const STRONG_TOTAL = /grand|incl|inc\.|with\s*vat|due|payable|شامل|المستحق|الكلي/i;
const NET = /sub\s*-?\s*total|net\s*amount|taxable\s*(amount|value)|total\s*(excl|exc\.|before|without)|amount\s*(excl|before)|المجموع\s*الفرعي|قبل\s*الضريبة|الخاضع\s*للضريبة|غير\s*شامل/i;
const VAT = /\bvat\b|\btax\b|ضريبة\s*القيمة\s*المضافة|الضريبة|ض\.ق\.م/i;
const NOT_VAT_AMOUNT = /vat\s*(no|number|reg|registration|in|id)|vatin|tax\s*(no|number|reg|id|card|invoice)|الرقم\s*الضريبي|رقم\s*التسجيل|سجل|فاتورة\s*ضريبية|tax\s*invoice/i;
const REF = /(?:invoice|inv|bill|receipt|credit\s*note|note|document|doc|ref(?:erence)?)\s*(?:no\.?|number|num|#)?\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/_-]*\d[A-Z0-9/_-]*)|(?:رقم\s*(?:الفاتورة|الإيصال|المستند|الإشعار)|فاتورة\s*رقم|إيصال\s*رقم|إشعار\s*دائن\s*رقم)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/_-]*\d[A-Z0-9/_-]*)/i;
const DATE_LABEL = /date|التاريخ|تاريخ/i;
const SKIP_NAME = /invoice|receipt|tax|vat|date|total|bill|فاتورة|إيصال|ايصال|ضريب|تاريخ|الإجمالي|page|صفحة/i;

/** Read the fields of a purchase document from its text. */
export function readReceipt(state: AppState, rawText: string): ReceiptReading {
  const text = normaliseText(rawText);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const warnings: ReceiptReading['warnings'] = [];
  if (!lines.length || text.replace(/\s/g, '').length < 8) return { warnings: [{ message: RECEIPT_MESSAGES.noText }] };

  // VAT number of the supplier: the first one that is not our own.
  const own = (state.settings.companyTaxId ?? '').replace(/\s/g, '').toUpperCase();
  const vatins = [...text.matchAll(/\bOM\s?(\d{10})\b/gi)].map((m) => `OM${m[1]}`);
  const vatin = vatins.find((v) => v !== own);

  // Vendor: by VAT number, then by a vendor name printed on the paper.
  const vendors = state.partners.filter((p) => p.active !== false);
  let vendorId = vatin ? vendors.find((p) => p.taxId.replace(/\s/g, '').toUpperCase() === vatin)?.id : undefined;
  if (!vendorId) {
    const lower = text.toLowerCase();
    vendorId = vendors
      .filter((p) => p.isVendor && p.name.trim().length >= 3 && lower.includes(p.name.trim().toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0]?.id;
  }
  const vendorGuess = vendorId ? undefined : lines.slice(0, 6).find((l) => !SKIP_NAME.test(l) && /[A-Za-z؀-ۿ]{3}/.test(l) && !/\d{5,}/.test(l));

  // Invoice number and date, preferring labelled lines.
  let reference: string | undefined;
  for (const l of lines) {
    const m = REF.exec(l);
    if (m && !/^OM\d{10}$/i.test(m[1] ?? m[2])) {
      reference = (m[1] ?? m[2]).replace(/[.:]+$/, '');
      break;
    }
  }
  const date = lines.filter((l) => DATE_LABEL.test(l)).flatMap(datesIn)[0] ?? lines.flatMap(datesIn)[0];

  // Amounts: the last number on a labelled line is usually the amount.
  const last = (l: string) => {
    const a = amountsIn(l);
    return a.length ? a[a.length - 1] : undefined;
  };
  const totalLines = lines.filter((l) => has(l, TOTAL) && !has(l, NET));
  const strong = totalLines.filter((l) => has(l, STRONG_TOTAL)).map(last).filter((x): x is number => x !== undefined);
  const plain = totalLines.map(last).filter((x): x is number => x !== undefined);
  let total = strong.length ? Math.max(...strong) : plain.length ? Math.max(...plain) : undefined;
  let net = lines.filter((l) => has(l, NET)).map(last).find((x) => x !== undefined);
  const vatLines = lines.filter((l) => has(l, VAT) && !has(l, NOT_VAT_AMOUNT) && !has(l, TOTAL) && !has(l, NET));
  let vat = vatLines.map(last).find((x) => x !== undefined);
  const rateText = [...text.matchAll(/(\d{1,2}(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1])).find((r) => r > 0 && r <= 25);

  // Fill the missing amount from the other two, or from the printed rate.
  const d = state.settings.decimals;
  if (total === undefined && net !== undefined && vat !== undefined) total = round(net + vat, d);
  if (net === undefined && total !== undefined && vat !== undefined) net = round(total - vat, d);
  if (vat === undefined && total !== undefined && net !== undefined) vat = round(total - net, d);
  if (net === undefined && vat === undefined && total !== undefined && rateText) {
    net = round(total / (1 + rateText / 100), d);
    vat = round(total - net, d);
  }
  if (net === undefined && total !== undefined) net = total;

  let rate = rateText;
  if (vat !== undefined && net) {
    const computed = round((vat / net) * 100, 1);
    if (!rate || Math.abs(computed - rate) > 0.6) rate = Math.round(computed);
  }
  if (!vat) rate = vat === 0 ? 0 : undefined;
  const purchase = state.taxes.filter((t) => t.active && t.typeTaxUse === 'purchase' && !t.priceInclude && !t.reverseCharge);
  const taxId = rate ? purchase.find((t) => t.vatCategory === 'standard' && t.amountType === 'percent' && t.amount === rate)?.id : undefined;

  if (total === undefined) warnings.push({ message: RECEIPT_MESSAGES.noTotal });
  else if (!vat) warnings.push({ message: RECEIPT_MESSAGES.noVat });
  if (net !== undefined && vat !== undefined && total !== undefined && Math.abs(round(net + vat, d) - total) > 0.01) {
    warnings.push({ message: RECEIPT_MESSAGES.mismatch, params: { net: net.toFixed(d), vat: vat.toFixed(d), total: total.toFixed(d) } });
  }
  if (!date) warnings.push({ message: RECEIPT_MESSAGES.noDate });
  if (!reference) warnings.push({ message: RECEIPT_MESSAGES.noReference });
  if (!vendorId) warnings.push(vendorGuess ? { message: RECEIPT_MESSAGES.vendorGuess, params: { name: vendorGuess } } : { message: RECEIPT_MESSAGES.noVendor });

  return { vendorId, vendorGuess, vatin, reference, date, net, vat, total, rate, taxId, warnings };
}

/** Where a scanned paper goes: a purchase bill, a vendor credit note, or a cash expense paid on the spot. */
export type DocumentKind = 'bill' | 'credit' | 'expense';

const CREDIT_WORDS = /credit\s*note|credit\s*memo|إشعار\s*دائن|اشعار\s*دائن/i;
const RECEIPT_WORDS = /\breceipt\b|cash\s*sale|\bchange\b|\bcashier\b|\btill\b|\bpos\b|\bvisa\b|mastercard|thank\s*you|إيصال|ايصال|نقداً|شكراً/i;
const INVOICE_WORDS = /invoice|فاتورة/i;

/**
 * Decide where a paper goes from its words: "credit note" → vendor credit note; a till receipt
 * (receipt words, or no invoice and no supplier VAT number) → cash expense; otherwise a purchase bill.
 */
export function classifyDocument(rawText: string, reading: ReceiptReading): DocumentKind {
  const text = normaliseText(rawText);
  if (CREDIT_WORDS.test(text)) return 'credit';
  const invoice = INVOICE_WORDS.test(text);
  if (RECEIPT_WORDS.test(text) && !(invoice && reading.vatin)) return 'expense';
  if (!invoice && !reading.vatin) return 'expense';
  return 'bill';
}

const AMOUNT_WORDS = /\b(sub\s*)?total\b|\bamount\b|الإجمالي|الاجمالي|المجموع|المبلغ/i;
const CURRENCY = /\bOMR\b|\bR\.?O\b|ر\.\s?ع|ريال|بيسة|\bbaisa\b/i;

/**
 * Whether the text is that of a bill, receipt or credit note: an amount to pay plus at least one
 * accounting sign (VAT number, invoice / receipt / VAT / total words, or the currency). Anything else
 * (a person, a letter, a page of a book) is refused, so only accounting documents are kept in the books.
 * A text check, not an image scanner: it looks only at the words on the paper.
 */
export function isAccountingDocument(rawText: string, reading: ReceiptReading): boolean {
  if (!reading.total || reading.total <= 0) return false;
  const text = normaliseText(rawText);
  return !!reading.vatin || [INVOICE_WORDS, CREDIT_WORDS, RECEIPT_WORDS, VAT, AMOUNT_WORDS, CURRENCY].some((w) => w.test(text));
}

/** Expense account by keywords on the paper (fuel, taxi, electricity, rent…), by account code in the chart. */
const KEYWORD_ACCOUNTS: [RegExp, string][] = [
  [/fuel|petrol|diesel|gasoline|shell|oman\s*oil|al\s*maha|taxi|uber|careem|parking|وقود|بنزين|ديزل|تاكسي|أجرة|مواقف/i, '618000'],
  [/electricity|water|nama|كهرباء|مياه|نماء/i, '613000'],
  [/omantel|ooredoo|vodafone|internet|mobile|telephone|اتصالات|إنترنت|انترنت|عمانتل|أوريدو/i, '619000'],
  [/\brent\b|lease|إيجار|ايجار/i, '612000'],
  [/stationery|printer|paper|toner|office\s*supplies|قرطاسية|أدوات\s*مكتبية|ورق/i, '615000'],
  [/bank\s*(charge|fee)|رسوم\s*بنكية/i, '614000'],
  [/advert|marketing|إعلان|تسويق/i, '616000'],
];

/**
 * The account and tax this vendor was booked to last time (the newest posted bill, credit note or
 * cash expense with that vendor), so a second scan needs almost no checking.
 */
export function vendorDefaults(state: AppState, vendorId: ID): { accountId?: ID; taxId?: ID } {
  type Hit = { date: string; accountId?: ID; taxId?: ID };
  const hits: Hit[] = [];
  for (const m of state.moves) {
    if (m.partnerId !== vendorId || m.state !== 'posted' || (m.moveType !== 'in_invoice' && m.moveType !== 'in_refund')) continue;
    const line = m.invoiceLines.find((l) => l.accountId) ?? m.invoiceLines[0];
    const booked = m.lines.find((l) => l.kind === 'product');
    if (line || booked) hits.push({ date: m.date, accountId: line?.accountId ?? booked?.accountId, taxId: line?.taxIds[0] });
  }
  for (const p of state.payments) {
    if (p.partnerId === vendorId && p.partnerType === 'other' && p.state === 'posted') hits.push({ date: p.date, accountId: p.counterpartAccountId, taxId: p.taxId });
  }
  const last = hits.sort((a, b) => b.date.localeCompare(a.date))[0];
  return last ? { accountId: last.accountId, taxId: last.taxId } : {};
}

/** Account for a scanned paper: what this vendor was booked to before, else a keyword match, else none (journal default). */
export function suggestAccount(state: AppState, rawText: string, vendorId?: ID): ID | undefined {
  const remembered = vendorId ? vendorDefaults(state, vendorId).accountId : undefined;
  if (remembered && state.accounts.some((a) => a.id === remembered)) return remembered;
  const text = normaliseText(rawText);
  for (const [words, code] of KEYWORD_ACCOUNTS) {
    if (words.test(text)) {
      const account = state.accounts.find((a) => a.code === code && a.active !== false);
      if (account) return account.id;
    }
  }
  return undefined;
}

/** A draft purchase bill (or vendor credit note) holding what was read. Hisab recalculates VAT and the total from the net amount. */
export function draftBillFromReading(
  state: AppState,
  reading: ReceiptReading,
  fallbackDate: string,
  lineLabel: string,
  opts: { kind?: 'bill' | 'credit'; accountId?: ID } = {},
): Move {
  const partner = reading.vendorId ? state.partners.find((p) => p.id === reading.vendorId) : undefined;
  const date = reading.date ?? fallbackDate;
  return newMove(state, opts.kind === 'credit' ? 'in_refund' : 'in_invoice', {
    partnerId: partner?.id,
    date,
    invoiceDate: date,
    ref: reading.reference ?? '',
    paymentTermId: partner?.paymentTermId ?? state.settings.defaultPaymentTermId,
    invoiceLines:
      reading.net !== undefined
        ? [newInvoiceLine({ label: lineLabel, priceUnit: reading.net, taxIds: reading.taxId ? [reading.taxId] : [], accountId: opts.accountId })]
        : [],
  });
}

/** Add the vendor read from the paper (name and VAT number). */
export function addVendorFromReading(state: AppState, name: string, vatin?: string): { state: AppState; id: ID } {
  const partner: Partner = { id: newId(), name: name.trim(), email: '', phone: '', street: '', city: '', country: state.settings.country, taxId: vatin ?? '', isCustomer: false, isVendor: true, notes: '', active: true };
  return { state: { ...state, partners: [...state.partners, partner] }, id: partner.id };
}
