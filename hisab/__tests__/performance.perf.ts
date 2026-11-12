/**
 * Performance: does Hisab stay quick when a busy business has a full year of books?
 *
 * Hisab has no server, so "many users at once" does not apply: every phone runs its own copy.
 * What can slow down is one device with a big book. This test builds one year of a busy shop
 * (12,000 sales invoices, 3,000 bills, payments on most of them) and times what a person waits for:
 * saving a new invoice, opening the reports, saving to storage and opening the app again.
 *
 * The limits are several times the measured times, so a slow CI machine passes, but a change
 * that makes the app scale badly (for example, an action that reads every record each time) fails.
 * It found one: the Dashboard took 18 seconds on such a book, because the status of each paid
 * invoice searched the whole book again. Now about 0.7 seconds.
 *
 * Slow to set up (a few minutes), so it runs on its own: npm run test:perf (and in CI).
 */
import { diffStates, migrate } from '../src/data/persistence';
import { invoiceStatus, isInvoice, newInvoiceLine, newMove, postMove, registerPayment, saveDraft } from '../src/domain/engine';
import { cashPosition, partnerOutstanding, vatReturn } from '../src/domain/management';
import { agedBalance, balanceSheet, dashboard, profitAndLoss, trialBalance } from '../src/domain/reports';
import { createDemoCompany } from '../src/domain/seed';
import { AppState, Move, MoveType } from '../src/domain/types';
import { addDays, round, today } from '../src/domain/utils';

const SALES = 12_000;
const BILLS = 3_000;

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Milliseconds `fn` takes, best of `times` runs (the best run is the least disturbed by the machine). */
function time(fn: () => unknown, times = 3): number {
  let best = Infinity;
  for (let i = 0; i < times; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

function document(s: AppState, r: () => number, type: MoveType, date: string): Move {
  const sale = type === 'out_invoice';
  const partners = s.partners.filter((p) => (sale ? p.isCustomer : p.isVendor));
  const taxes = s.taxes.filter((t) => t.typeTaxUse === (sale ? 'sale' : 'purchase'));
  const mv = newMove(s, type, { partnerId: partners[Math.floor(r() * partners.length)].id, date, invoiceDate: date });
  return {
    ...mv,
    invoiceLines: Array.from({ length: 1 + Math.floor(r() * 3) }, () =>
      newInvoiceLine({ label: 'Item', quantity: 1 + Math.floor(r() * 5), priceUnit: round(1 + r() * 200, 3), taxIds: [taxes[0].id] }),
    ),
  };
}

/** One year of a busy shop: documents spread over the last 365 days, about 80% of them paid. */
function busyYear(): AppState {
  const r = rng(2026);
  let s = createDemoCompany();
  seeded = s.moves.filter((m) => isInvoice(m.moveType) && m.state === 'posted').length;
  const bank = s.journals.find((j) => j.type === 'bank')!;
  for (let i = 0; i < SALES + BILLS; i++) {
    const type: MoveType = i % 5 === 4 && i / 5 < BILLS ? 'in_invoice' : 'out_invoice';
    const date = addDays(today(), -Math.floor(r() * 365));
    const mv = document(s, r, type, date);
    s = postMove(saveDraft(s, mv), mv.id);
    if (r() < 0.8) {
      const posted = s.moves.find((m) => m.id === mv.id)!;
      const sale = type === 'out_invoice';
      s = registerPayment(s, {
        paymentType: sale ? 'inbound' : 'outbound',
        partnerType: sale ? 'customer' : 'supplier',
        partnerId: posted.partnerId!,
        // Just posted, so nothing is matched yet: an empty index gives the full amount without reading the book.
        amount: invoiceStatus(s, posted, new Map()).residual,
        date,
        journalId: bank.id,
        memo: posted.name,
        method: 'bank_transfer',
        moveIds: [posted.id],
      }).state;
    }
  }
  return s;
}

let books: AppState;
let seeded = 0;
const results: Record<string, string> = {};

beforeAll(() => {
  const t = performance.now();
  books = busyYear();
  results['Build one busy year (setup, not a user action)'] = `${Math.round(performance.now() - t)} ms`;
});

afterAll(() => {
  // Printed so the numbers can be read in the CI log.
  console.log(`Performance with ${SALES.toLocaleString('en')} sales invoices and ${BILLS.toLocaleString('en')} bills:\n${Object.entries(results).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
});

it('builds the big book correctly', () => {
  const docs = books.moves.filter((m) => isInvoice(m.moveType) && m.state === 'posted');
  expect(docs).toHaveLength(seeded + SALES + BILLS);
  const tb = trialBalance(books, '2000-01-01', '2099-12-31');
  expect(Math.abs(tb.totals.debit - tb.totals.credit)).toBeLessThan(0.001);
});

it('saves and posts a new invoice quickly, however big the book is', () => {
  const r = rng(7);
  const ms = time(() => {
    const mv = document(books, r, 'out_invoice', today());
    postMove(saveDraft(books, mv), mv.id);
  }, 5);
  results['Save and post one more invoice'] = `${ms.toFixed(1)} ms`;
  expect(ms).toBeLessThan(250);
});

it('records a payment quickly, however big the book is', () => {
  const bank = books.journals.find((j) => j.type === 'bank')!;
  const open = books.moves.find((m) => m.moveType === 'out_invoice' && m.state === 'posted' && invoiceStatus(books, m).paymentState === 'not_paid')!;
  const ms = time(() =>
    registerPayment(books, {
      paymentType: 'inbound',
      partnerType: 'customer',
      partnerId: open.partnerId!,
      amount: invoiceStatus(books, open).residual,
      date: today(),
      journalId: bank.id,
      memo: open.name,
      method: 'bank_transfer',
      moveIds: [open.id],
    }),
  );
  results['Record one payment'] = `${ms.toFixed(1)} ms`;
  expect(ms).toBeLessThan(500);
});

it('works out what to save after a change without slowing down', () => {
  const r = rng(8);
  const mv = document(books, r, 'out_invoice', today());
  const next = postMove(saveDraft(books, mv), mv.id);
  let change = diffStates(books, next);
  const ms = time(() => (change = diffStates(books, next)), 5);
  results['Find the records to save after one change'] = `${ms.toFixed(1)} ms`;
  // Only the new invoice and its numbering change, not the whole book.
  expect(change.upserts.length).toBeLessThan(5);
  expect(ms).toBeLessThan(250);
});

it.each([
  ['Dashboard', (s: AppState) => dashboard(s)],
  ['Trial balance', (s: AppState) => trialBalance(s, addDays(today(), -365), today())],
  ['Profit and loss', (s: AppState) => profitAndLoss(s, addDays(today(), -365), today())],
  ['Balance sheet', (s: AppState) => balanceSheet(s, today())],
  ['Aged receivables', (s: AppState) => agedBalance(s, 'receivable', today())],
  ['Who owes us (by customer)', (s: AppState) => partnerOutstanding(s, 'receivable', today())],
  ['Cash position', (s: AppState) => cashPosition(s, today())],
  ['VAT return (one year)', (s: AppState) => vatReturn(s, addDays(today(), -365), today())],
])('opens the %s report quickly', (name, report) => {
  const ms = time(() => report(books));
  results[`Report: ${name}`] = `${ms.toFixed(0)} ms`;
  expect(ms).toBeLessThan(2_000);
});

it('saves the whole book and opens it again quickly', () => {
  let json = '';
  const save = time(() => (json = JSON.stringify(books)));
  const open = time(() => migrate(JSON.parse(json)));
  const mb = json.length / 1024 / 1024;
  results['Size of the whole book'] = `${mb.toFixed(1)} MB`;
  results['Save the whole book (backup, web preview)'] = `${save.toFixed(0)} ms`;
  results['Open the whole book (app start)'] = `${open.toFixed(0)} ms`;
  expect(save).toBeLessThan(3_000);
  expect(open).toBeLessThan(3_000);
  expect(migrate(JSON.parse(json)).moves).toHaveLength(books.moves.length);
});
