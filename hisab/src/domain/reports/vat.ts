// Tax report and the VAT closing entry.
import { checkLockDate, defaultJournal, nextSequence } from '../engine';
import { AccountingError, AppState, ID, Move, MoveLine, Tax } from '../types';
import { byId, isZero, newId, round } from '../utils';
import { postedItems } from './base';

// ---------------------------------------------------------------------------
// Tax report & closing
// ---------------------------------------------------------------------------

export interface TaxReportRow {
  tax: Tax;
  base: number;
  amount: number;
  /** Output VAT self-assessed on a reverse-charge purchase. */
  reverseCharge?: boolean;
}

export interface TaxReport {
  sales: TaxReportRow[];
  purchases: TaxReportRow[];
  salesTax: number;
  purchaseTax: number;
  net: number;
}

export function taxReport(state: AppState, from: string, to: string): TaxReport {
  const d = state.settings.decimals;
  const taxes = byId(state.taxes);
  const rows = new Map<ID, TaxReportRow>();
  const reverse = new Map<string, TaxReportRow>();
  const row = (tax: Tax) => {
    const r = rows.get(tax.id) ?? { tax, base: 0, amount: 0 };
    rows.set(tax.id, r);
    return r;
  };
  for (const { move, line } of postedItems(state, { from, to })) {
    if (move.origin === 'tax_closing') continue;
    // Sales report credits as positive, purchases debits as positive.
    if (line.taxIds) {
      for (const tid of line.taxIds) {
        const tax = taxes.get(tid);
        if (!tax) continue;
        const sign = tax.typeTaxUse === 'purchase' ? 1 : -1;
        row(tax).base += sign * (line.debit - line.credit);
      }
    }
    if (line.taxId) {
      const tax = taxes.get(line.taxId);
      if (!tax) continue;
      if (line.reverseCharge) {
        // Self-assessed output VAT is due like a sale.
        const key = `${tax.id}_rc`;
        const r = reverse.get(key) ?? { tax, base: 0, amount: 0, reverseCharge: true };
        r.amount += line.credit - line.debit;
        reverse.set(key, r);
        continue;
      }
      const sign = tax.typeTaxUse === 'purchase' ? 1 : -1;
      row(tax).amount += sign * (line.debit - line.credit);
    }
  }
  for (const [key, r] of reverse) r.base = rows.get(key.replace(/_rc$/, ''))?.base ?? 0;
  const all = [...rows.values()].map((r) => ({ ...r, base: round(r.base, d), amount: round(r.amount, d) }));
  const sales = [
    ...all.filter((r) => r.tax.typeTaxUse !== 'purchase'),
    ...[...reverse.values()].map((r) => ({ ...r, base: round(r.base, d), amount: round(r.amount, d) })),
  ];
  const purchases = all.filter((r) => r.tax.typeTaxUse === 'purchase');
  const salesTax = round(sales.reduce((s, r) => s + r.amount, 0), d);
  const purchaseTax = round(purchases.reduce((s, r) => s + r.amount, 0), d);
  return { sales, purchases, salesTax, purchaseTax, net: round(salesTax - purchaseTax, d) };
}

/** Move the period's tax balances to the tax settlement account. */
export function postTaxClosing(state: AppState, from: string, to: string): AppState {
  const d = state.settings.decimals;
  const key = `${from}_${to}`;
  if (state.moves.some((m) => m.origin === 'tax_closing' && m.originId === key && m.state === 'posted')) {
    throw new AccountingError('A tax closing entry already exists for this period.');
  }
  checkLockDate(state, to, true);
  const perAccount = new Map<ID, number>();
  for (const { move, line } of postedItems(state, { from, to })) {
    if (!line.taxId || move.origin === 'tax_closing') continue;
    perAccount.set(line.accountId, (perAccount.get(line.accountId) ?? 0) + line.debit - line.credit);
  }
  const lines: MoveLine[] = [];
  let net = 0;
  for (const [accountId, bal] of perAccount) {
    const b = round(bal, d);
    if (isZero(b, d)) continue;
    net += b;
    lines.push({ id: newId(), accountId, label: 'Tax closing', debit: b < 0 ? -b : 0, credit: b > 0 ? b : 0, kind: 'other' });
  }
  if (!lines.length) throw new AccountingError('There are no taxes to close in this period.');
  net = round(net, d);
  if (!isZero(net, d)) {
    lines.push({
      id: newId(),
      accountId: state.settings.taxSettlementAccountId,
      label: net < 0 ? 'VAT payable' : 'VAT receivable',
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
      kind: 'other',
    });
  }
  const journal = defaultJournal(state, 'general');
  const seq = nextSequence(state, journal.code, to);
  const move: Move = {
    id: newId(),
    moveType: 'entry',
    name: seq.name,
    state: 'posted',
    journalId: journal.id,
    date: to,
    ref: `VAT return ${from} - ${to}`,
    narration: '',
    invoiceLines: [],
    lines,
    origin: 'tax_closing',
    originId: key,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
  };
  return {
    ...seq.state,
    moves: [...seq.state.moves, move],
    settings: { ...seq.state.settings, taxLockDate: to > (state.settings.taxLockDate ?? '') ? to : state.settings.taxLockDate },
  };
}
