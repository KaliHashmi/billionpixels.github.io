import { checkLockDate, defaultJournal, isInvoice, lineResidual, buildReconcileIndex, nextSequence, invoiceStatus } from './engine';
import { isPnlType } from './template';
import { Account, AccountingError, AccountType, AppState, ID, Move, MoveLine, Partner, Tax } from './types';
import { addDays, byId, daysBetween, fiscalYear, isZero, newId, round, today } from './utils';

export interface Item {
  move: Move;
  line: MoveLine;
  account: Account;
}

export interface Period {
  from?: string;
  to?: string;
}

export function postedItems(state: AppState, period: Period = {}): Item[] {
  const accounts = byId(state.accounts);
  const out: Item[] = [];
  for (const move of state.moves) {
    if (move.state !== 'posted') continue;
    if (period.from && move.date < period.from) continue;
    if (period.to && move.date > period.to) continue;
    for (const line of move.lines) {
      const account = accounts.get(line.accountId);
      if (account) out.push({ move, line, account });
    }
  }
  return out.sort((a, b) => a.move.date.localeCompare(b.move.date) || a.move.name.localeCompare(b.move.name));
}

function balancesByAccount(items: Item[]): Map<ID, { debit: number; credit: number }> {
  const m = new Map<ID, { debit: number; credit: number }>();
  for (const it of items) {
    const b = m.get(it.account.id) ?? { debit: 0, credit: 0 };
    b.debit += it.line.debit;
    b.credit += it.line.credit;
    m.set(it.account.id, b);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  account: Account;
  initial: number;
  debit: number;
  credit: number;
  end: number;
}

export function trialBalance(state: AppState, from: string, to: string): { rows: TrialBalanceRow[]; totals: Omit<TrialBalanceRow, 'account'> } {
  const d = state.settings.decimals;
  const fyStart = fiscalYear(from, state.settings.fiscalYearLastMonth).start;
  const before = postedItems(state, { to: addDays(from, -1) }).filter(
    // P&L accounts restart every fiscal year.
    (it) => !isPnlType(it.account.type) || it.move.date >= fyStart,
  );
  const initial = balancesByAccount(before);
  const period = balancesByAccount(postedItems(state, { from, to }));
  const rows: TrialBalanceRow[] = [];
  for (const account of [...state.accounts].sort((a, b) => a.code.localeCompare(b.code))) {
    const i = initial.get(account.id);
    const p = period.get(account.id);
    if (!i && !p) continue;
    const init = round((i?.debit ?? 0) - (i?.credit ?? 0), d);
    const debit = round(p?.debit ?? 0, d);
    const credit = round(p?.credit ?? 0, d);
    rows.push({ account, initial: init, debit, credit, end: round(init + debit - credit, d) });
  }
  const totals = {
    initial: round(rows.reduce((s, r) => s + r.initial, 0), d),
    debit: round(rows.reduce((s, r) => s + r.debit, 0), d),
    credit: round(rows.reduce((s, r) => s + r.credit, 0), d),
    end: round(rows.reduce((s, r) => s + r.end, 0), d),
  };
  return { rows, totals };
}

// ---------------------------------------------------------------------------
// Profit & Loss / Balance sheet
// ---------------------------------------------------------------------------

export interface ReportLine {
  label: string;
  amount: number;
  accountId?: ID;
  level: 0 | 1 | 2;
  bold?: boolean;
}

function sectionLines(
  state: AppState,
  balances: Map<ID, { debit: number; credit: number }>,
  types: AccountType[],
  sign: 1 | -1,
): { lines: ReportLine[]; total: number } {
  const d = state.settings.decimals;
  const lines: ReportLine[] = [];
  let total = 0;
  for (const a of [...state.accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    if (!types.includes(a.type)) continue;
    const b = balances.get(a.id);
    if (!b) continue;
    const amount = round(sign * (b.debit - b.credit), d);
    if (isZero(amount, d)) continue;
    total += amount;
    lines.push({ label: `${a.code} ${a.name}`, amount, accountId: a.id, level: 2 });
  }
  return { lines, total: round(total, d) };
}

export interface ProfitAndLoss {
  lines: ReportLine[];
  revenue: number;
  grossProfit: number;
  netProfit: number;
}

export function profitAndLoss(state: AppState, from: string, to: string): ProfitAndLoss {
  const d = state.settings.decimals;
  const balances = balancesByAccount(postedItems(state, { from, to }));
  const rev = sectionLines(state, balances, ['income'], -1);
  const cor = sectionLines(state, balances, ['expense_direct_cost'], 1);
  const oth = sectionLines(state, balances, ['income_other'], -1);
  const exp = sectionLines(state, balances, ['expense'], 1);
  const dep = sectionLines(state, balances, ['expense_depreciation'], 1);
  const grossProfit = round(rev.total - cor.total, d);
  const netProfit = round(grossProfit + oth.total - exp.total - dep.total, d);
  const lines: ReportLine[] = [
    { label: 'Revenue', amount: rev.total, level: 0, bold: true },
    ...rev.lines,
    { label: 'Cost of Revenue', amount: cor.total, level: 0, bold: true },
    ...cor.lines,
    { label: 'Gross Profit', amount: grossProfit, level: 0, bold: true },
    { label: 'Other Income', amount: oth.total, level: 0, bold: true },
    ...oth.lines,
    { label: 'Expenses', amount: exp.total, level: 0, bold: true },
    ...exp.lines,
    { label: 'Depreciation', amount: dep.total, level: 0, bold: true },
    ...dep.lines,
    { label: 'Net Profit', amount: netProfit, level: 0, bold: true },
  ];
  return { lines, revenue: rev.total, grossProfit, netProfit };
}

export interface BalanceSheet {
  lines: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export function balanceSheet(state: AppState, date: string): BalanceSheet {
  const d = state.settings.decimals;
  const fy = fiscalYear(date, state.settings.fiscalYearLastMonth);
  const items = postedItems(state, { to: date });
  const balances = balancesByAccount(items);

  const curAssets = sectionLines(state, balances, ['asset_receivable', 'asset_cash', 'asset_current', 'asset_prepayments'], 1);
  const fixed = sectionLines(state, balances, ['asset_fixed'], 1);
  const nonCur = sectionLines(state, balances, ['asset_non_current'], 1);
  const curLiab = sectionLines(state, balances, ['liability_payable', 'liability_credit_card', 'liability_current'], -1);
  const nonCurLiab = sectionLines(state, balances, ['liability_non_current'], -1);
  const equity = sectionLines(state, balances, ['equity'], -1);

  let currentEarnings = 0;
  let previousEarnings = 0;
  for (const it of items) {
    const isPnl = isPnlType(it.account.type);
    if (!isPnl && it.account.type !== 'equity_unaffected') continue;
    const v = it.line.credit - it.line.debit;
    if (isPnl && it.move.date >= fy.start) currentEarnings += v;
    else previousEarnings += v;
  }
  currentEarnings = round(currentEarnings, d);
  previousEarnings = round(previousEarnings, d);

  const totalAssets = round(curAssets.total + fixed.total + nonCur.total, d);
  const totalLiabilities = round(curLiab.total + nonCurLiab.total, d);
  const totalEquity = round(equity.total + currentEarnings + previousEarnings, d);

  const lines: ReportLine[] = [
    { label: 'ASSETS', amount: totalAssets, level: 0, bold: true },
    { label: 'Current Assets', amount: curAssets.total, level: 1, bold: true },
    ...curAssets.lines,
    { label: 'Fixed Assets', amount: fixed.total, level: 1, bold: true },
    ...fixed.lines,
    { label: 'Non-current Assets', amount: nonCur.total, level: 1, bold: true },
    ...nonCur.lines,
    { label: 'LIABILITIES', amount: totalLiabilities, level: 0, bold: true },
    { label: 'Current Liabilities', amount: curLiab.total, level: 1, bold: true },
    ...curLiab.lines,
    { label: 'Non-current Liabilities', amount: nonCurLiab.total, level: 1, bold: true },
    ...nonCurLiab.lines,
    { label: 'EQUITY', amount: totalEquity, level: 0, bold: true },
    ...equity.lines,
    { label: 'Current Year Unallocated Earnings', amount: currentEarnings, level: 2 },
    { label: 'Previous Years Unallocated Earnings', amount: previousEarnings, level: 2 },
    { label: 'LIABILITIES + EQUITY', amount: round(totalLiabilities + totalEquity, d), level: 0, bold: true },
  ];
  return { lines, totalAssets, totalLiabilities, totalEquity };
}

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

export interface LedgerLine extends Item {
  balance: number;
}

export interface LedgerGroup {
  key: ID;
  title: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  lines: LedgerLine[];
}

export function generalLedger(state: AppState, from: string, to: string, accountId?: ID): LedgerGroup[] {
  const d = state.settings.decimals;
  const tb = trialBalance(state, from, to);
  const items = postedItems(state, { from, to });
  const groups: LedgerGroup[] = [];
  for (const row of tb.rows) {
    if (accountId && row.account.id !== accountId) continue;
    let bal = row.initial;
    const lines = items
      .filter((it) => it.account.id === row.account.id)
      .map((it) => {
        bal = round(bal + it.line.debit - it.line.credit, d);
        return { ...it, balance: bal };
      });
    groups.push({
      key: row.account.id,
      title: `${row.account.code} ${row.account.name}`,
      opening: row.initial,
      debit: row.debit,
      credit: row.credit,
      closing: row.end,
      lines,
    });
  }
  return groups;
}

export function partnerLedger(state: AppState, from: string, to: string, kind: 'customer' | 'supplier' | 'all'): LedgerGroup[] {
  const d = state.settings.decimals;
  const s = state.settings;
  const accounts = new Set(kind === 'customer' ? [s.receivableAccountId] : kind === 'supplier' ? [s.payableAccountId] : [s.receivableAccountId, s.payableAccountId]);
  const partners = byId(state.partners);
  const all = postedItems(state, { to }).filter((it) => accounts.has(it.account.id) && it.line.partnerId);
  const byPartner = new Map<ID, Item[]>();
  for (const it of all) {
    const arr = byPartner.get(it.line.partnerId!) ?? [];
    arr.push(it);
    byPartner.set(it.line.partnerId!, arr);
  }
  const groups: LedgerGroup[] = [];
  for (const [pid, its] of byPartner) {
    const opening = round(its.filter((i) => i.move.date < from).reduce((x, i) => x + i.line.debit - i.line.credit, 0), d);
    let bal = opening;
    let debit = 0;
    let credit = 0;
    const lines = its
      .filter((i) => i.move.date >= from)
      .map((i) => {
        debit += i.line.debit;
        credit += i.line.credit;
        bal = round(bal + i.line.debit - i.line.credit, d);
        return { ...i, balance: bal };
      });
    if (!lines.length && isZero(opening, d)) continue;
    groups.push({
      key: pid,
      title: partners.get(pid)?.name ?? 'Unknown partner',
      opening,
      debit: round(debit, d),
      credit: round(credit, d),
      closing: bal,
      lines,
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Aged receivable / payable
// ---------------------------------------------------------------------------

export const AGED_BUCKETS = ['Not due', '1-30', '31-60', '61-90', '91-120', 'Older'] as const;

export interface AgedRow {
  partner?: Partner;
  partnerId?: ID;
  buckets: number[];
  total: number;
  items: { move: Move; line: MoveLine; residual: number; days: number }[];
}

export function agedBalance(state: AppState, kind: 'receivable' | 'payable', asOf: string): { rows: AgedRow[]; totals: number[]; total: number } {
  const d = state.settings.decimals;
  const accountId = kind === 'receivable' ? state.settings.receivableAccountId : state.settings.payableAccountId;
  const sign = kind === 'receivable' ? 1 : -1;
  const idx = buildReconcileIndex(state.reconciles.filter((r) => r.date <= asOf));
  const partners = byId(state.partners);
  const rows = new Map<string, AgedRow>();
  for (const move of state.moves) {
    if (move.state !== 'posted' || move.date > asOf) continue;
    for (const line of move.lines) {
      if (line.accountId !== accountId) continue;
      const residual = round(sign * lineResidual(line, idx, d), d);
      if (isZero(residual, d)) continue;
      const due = line.dateMaturity ?? move.date;
      const days = daysBetween(due, asOf);
      const bucket = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : days <= 120 ? 4 : 5;
      const key = line.partnerId ?? '';
      const row = rows.get(key) ?? { partner: partners.get(key), partnerId: line.partnerId, buckets: [0, 0, 0, 0, 0, 0], total: 0, items: [] };
      row.buckets[bucket] = round(row.buckets[bucket] + residual, d);
      row.total = round(row.total + residual, d);
      row.items.push({ move, line, residual, days });
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const totals = [0, 1, 2, 3, 4, 5].map((i) => round(list.reduce((s, r) => s + r.buckets[i], 0), d));
  return { rows: list, totals, total: round(totals.reduce((s, v) => s + v, 0), d) };
}

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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface JournalCard {
  journalId: ID;
  name: string;
  type: string;
  primary: { label: string; amount: number; count: number };
  secondary: { label: string; amount: number; count: number }[];
}

export interface Dashboard {
  cards: JournalCard[];
  receivable: number;
  payable: number;
  overdueReceivable: number;
  overduePayable: number;
  cash: number;
  monthlySales: { label: string; amount: number }[];
  monthlyExpenses: { label: string; amount: number }[];
  netProfitYtd: number;
}

export function dashboard(state: AppState, asOf = today()): Dashboard {
  const d = state.settings.decimals;
  const idx = buildReconcileIndex(state.reconciles);
  const cards: JournalCard[] = [];
  const balances = balancesByAccount(postedItems(state, { to: asOf }));
  const bal = (id?: ID) => {
    const b = id ? balances.get(id) : undefined;
    return round((b?.debit ?? 0) - (b?.credit ?? 0), d);
  };

  for (const j of state.journals.filter((x) => x.active)) {
    if (j.type === 'sale' || j.type === 'purchase') {
      const docs = state.moves.filter((m) => m.journalId === j.id && isInvoice(m.moveType));
      const drafts = docs.filter((m) => m.state === 'draft');
      const open = docs
        .filter((m) => m.state === 'posted')
        .map((m) => ({ m, st: invoiceStatus(state, m, idx) }))
        .filter((x) => x.st.paymentState === 'not_paid' || x.st.paymentState === 'partial');
      const late = open.filter((x) => x.st.overdue);
      const signed = (x: { m: Move; st: { residual: number } }) =>
        x.m.moveType === 'out_refund' || x.m.moveType === 'in_refund' ? -x.st.residual : x.st.residual;
      cards.push({
        journalId: j.id,
        name: j.name,
        type: j.type,
        primary: {
          label: j.type === 'sale' ? 'Awaiting payment' : 'To pay',
          amount: round(open.reduce((s, x) => s + signed(x), 0), d),
          count: open.length,
        },
        secondary: [
          { label: j.type === 'sale' ? 'Invoices to validate' : 'Bills to validate', amount: round(drafts.reduce((s, m) => s + invoiceStatus(state, m, idx).total, 0), d), count: drafts.length },
          { label: 'Late', amount: round(late.reduce((s, x) => s + signed(x), 0), d), count: late.length },
        ],
      });
    } else if (j.type === 'bank' || j.type === 'cash') {
      const lines = state.statementLines.filter((s) => s.journalId === j.id);
      const toReconcile = lines.filter((s) => !s.reconciled);
      const secondary = [{ label: 'Balance in statement', amount: round(lines.reduce((s, l) => s + l.amount, 0), d), count: lines.length }];
      if (j.type === 'bank') {
        secondary.unshift({ label: 'To reconcile', amount: round(toReconcile.reduce((s, l) => s + l.amount, 0), d), count: toReconcile.length });
        const outstanding = state.payments.filter((p) => p.journalId === j.id && p.state === 'posted');
        const unmatched = outstanding.filter((p) => {
          const mv = state.moves.find((m) => m.id === p.moveId);
          const l = mv?.lines.find((x) => x.kind === 'other');
          return l && !isZero(lineResidual(l, idx, d), d);
        });
        secondary.push({
          label: 'Outstanding payments',
          amount: round(unmatched.reduce((s, p) => s + (p.paymentType === 'inbound' ? p.amount : -p.amount), 0), d),
          count: unmatched.length,
        });
      }
      cards.push({
        journalId: j.id,
        name: j.name,
        type: j.type,
        primary: { label: 'Balance', amount: bal(j.defaultAccountId), count: 0 },
        secondary,
      });
    } else {
      const drafts = state.moves.filter((m) => m.journalId === j.id && m.state === 'draft');
      cards.push({ journalId: j.id, name: j.name, type: j.type, primary: { label: 'Entries to review', amount: 0, count: drafts.length }, secondary: [] });
    }
  }

  const aged = (kind: 'receivable' | 'payable') => agedBalance(state, kind, asOf);
  const ar = aged('receivable');
  const ap = aged('payable');
  const cash = round(state.accounts.filter((a) => a.type === 'asset_cash').reduce((s, a) => s + bal(a.id), 0), d);

  // Last 6 months income / expenses
  const monthlySales: { label: string; amount: number }[] = [];
  const monthlyExpenses: { label: string; amount: number }[] = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = new Date(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, 1);
  const items = postedItems(state, { to: asOf });
  for (let i = 5; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const prefix = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    let inc = 0;
    let exp = 0;
    for (const it of items) {
      if (!it.move.date.startsWith(prefix)) continue;
      if (it.account.type.startsWith('income')) inc += it.line.credit - it.line.debit;
      else if (it.account.type.startsWith('expense')) exp += it.line.debit - it.line.credit;
    }
    monthlySales.push({ label: months[m.getMonth()], amount: round(inc, d) });
    monthlyExpenses.push({ label: months[m.getMonth()], amount: round(exp, d) });
  }
  const fy = fiscalYear(asOf, state.settings.fiscalYearLastMonth);
  return {
    cards,
    receivable: ar.total,
    payable: ap.total,
    overdueReceivable: round(ar.total - ar.totals[0], d),
    overduePayable: round(ap.total - ap.totals[0], d),
    cash,
    monthlySales,
    monthlyExpenses,
    netProfitYtd: profitAndLoss(state, fy.start, asOf).netProfit,
  };
}

// ---------------------------------------------------------------------------
// Cash flow, executive summary, journal audit, analytic
// ---------------------------------------------------------------------------

function cashFlowCategory(t: AccountType): 'operating' | 'investing' | 'financing' {
  if (t === 'asset_fixed' || t === 'asset_non_current') return 'investing';
  if (t === 'equity' || t === 'equity_unaffected' || t === 'liability_non_current') return 'financing';
  return 'operating';
}

export interface CashFlow {
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  closing: number;
  lines: ReportLine[];
}

/** Direct-method cash flow: counterparts of every movement on bank & cash accounts. */
export function cashFlow(state: AppState, from: string, to: string): CashFlow {
  const d = state.settings.decimals;
  const isCash = (a: Account) => a.type === 'asset_cash';
  const opening = round(postedItems(state, { to: addDays(from, -1) }).filter((i) => isCash(i.account)).reduce((s, i) => s + i.line.debit - i.line.credit, 0), d);
  const totals = { operating: 0, investing: 0, financing: 0 };
  const perAccount = new Map<ID, { account: Account; amount: number }>();
  const accounts = byId(state.accounts);
  for (const move of state.moves) {
    if (move.state !== 'posted' || move.date < from || move.date > to) continue;
    const hasCash = move.lines.some((l) => { const a = accounts.get(l.accountId); return a && isCash(a); });
    if (!hasCash) continue;
    for (const l of move.lines) {
      const a = accounts.get(l.accountId);
      if (!a || isCash(a)) continue;
      const v = l.credit - l.debit;
      totals[cashFlowCategory(a.type)] += v;
      const e = perAccount.get(a.id) ?? { account: a, amount: 0 };
      e.amount += v;
      perAccount.set(a.id, e);
    }
  }
  const lines: ReportLine[] = [{ label: 'Cash at beginning of period', amount: opening, level: 0, bold: true }];
  for (const cat of ['operating', 'investing', 'financing'] as const) {
    lines.push({ label: `Net cash from ${cat} activities`, amount: round(totals[cat], d), level: 0, bold: true });
    for (const e of [...perAccount.values()].filter((x) => cashFlowCategory(x.account.type) === cat).sort((a, b) => a.account.code.localeCompare(b.account.code))) {
      if (!isZero(e.amount, d)) lines.push({ label: `${e.account.code} ${e.account.name}`, amount: round(e.amount, d), accountId: e.account.id, level: 2 });
    }
  }
  const closing = round(opening + totals.operating + totals.investing + totals.financing, d);
  lines.push({ label: 'Cash at end of period', amount: closing, level: 0, bold: true });
  return { opening, closing, lines, operating: round(totals.operating, d), investing: round(totals.investing, d), financing: round(totals.financing, d) };
}

export function executiveSummary(state: AppState, from: string, to: string): ReportLine[] {
  const d = state.settings.decimals;
  const pl = profitAndLoss(state, from, to);
  const bs = balanceSheet(state, to);
  const tb = trialBalance(state, from, to).rows;
  const sumTypes = (types: AccountType[], sign: 1 | -1) => round(tb.filter((r) => types.includes(r.account.type)).reduce((s, r) => s + sign * r.end, 0), d);
  const cash = sumTypes(['asset_cash'], 1);
  const receivables = sumTypes(['asset_receivable'], 1);
  const payables = sumTypes(['liability_payable'], -1);
  const currentAssets = sumTypes(['asset_cash', 'asset_receivable', 'asset_current', 'asset_prepayments'], 1);
  const currentLiabilities = sumTypes(['liability_current', 'liability_payable', 'liability_credit_card'], -1);
  const cf = cashFlow(state, from, to);
  const pct = (a: number, b: number) => (isZero(b, d) ? 0 : round((a / b) * 100, 2));
  return [
    { label: 'Cash', amount: 0, level: 0, bold: true },
    { label: 'Cash received', amount: round(postedItems(state, { from, to }).filter((i) => i.account.type === 'asset_cash').reduce((s, i) => s + i.line.debit, 0), d), level: 2 },
    { label: 'Cash spent', amount: round(-postedItems(state, { from, to }).filter((i) => i.account.type === 'asset_cash').reduce((s, i) => s + i.line.credit, 0), d), level: 2 },
    { label: 'Cash surplus', amount: round(cf.closing - cf.opening, d), level: 2 },
    { label: 'Closing bank balance', amount: cash, level: 2 },
    { label: 'Profitability', amount: 0, level: 0, bold: true },
    { label: 'Income', amount: pl.revenue, level: 2 },
    { label: 'Gross profit', amount: pl.grossProfit, level: 2 },
    { label: 'Net profit', amount: pl.netProfit, level: 2 },
    { label: 'Gross profit margin (%)', amount: pct(pl.grossProfit, pl.revenue), level: 2 },
    { label: 'Net profit margin (%)', amount: pct(pl.netProfit, pl.revenue), level: 2 },
    { label: 'Balance Sheet', amount: 0, level: 0, bold: true },
    { label: 'Receivables', amount: receivables, level: 2 },
    { label: 'Payables', amount: payables, level: 2 },
    { label: 'Net assets', amount: round(bs.totalAssets - bs.totalLiabilities, d), level: 2 },
    { label: 'Current ratio', amount: isZero(currentLiabilities, d) ? 0 : round(currentAssets / currentLiabilities, 2), level: 2 },
  ];
}

export interface JournalAuditGroup {
  journalId: ID;
  title: string;
  moves: Move[];
  debit: number;
  credit: number;
}

export function journalAudit(state: AppState, from: string, to: string): JournalAuditGroup[] {
  const d = state.settings.decimals;
  return state.journals
    .map((j) => {
      const moves = state.moves
        .filter((m) => m.journalId === j.id && m.state === 'posted' && m.date >= from && m.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
      const debit = round(moves.reduce((s, m) => s + m.lines.reduce((x, l) => x + l.debit, 0), 0), d);
      const credit = round(moves.reduce((s, m) => s + m.lines.reduce((x, l) => x + l.credit, 0), 0), d);
      return { journalId: j.id, title: `${j.name} (${j.code})`, moves, debit, credit };
    })
    .filter((g) => g.moves.length);
}

export interface AnalyticRow {
  id: ID;
  name: string;
  income: number;
  expense: number;
  balance: number;
}

export function analyticReport(state: AppState, from: string, to: string): AnalyticRow[] {
  const d = state.settings.decimals;
  const rows = new Map<ID, AnalyticRow>();
  for (const a of state.analyticAccounts) rows.set(a.id, { id: a.id, name: a.code ? `[${a.code}] ${a.name}` : a.name, income: 0, expense: 0, balance: 0 });
  for (const it of postedItems(state, { from, to })) {
    const r = it.line.analyticAccountId ? rows.get(it.line.analyticAccountId) : undefined;
    if (!r || !isPnlType(it.account.type)) continue;
    const v = it.line.credit - it.line.debit;
    if (it.account.type.startsWith('income')) r.income += v;
    else r.expense -= v;
  }
  return [...rows.values()].map((r) => ({ ...r, income: round(r.income, d), expense: round(r.expense, d), balance: round(r.income - r.expense, d) }));
}
