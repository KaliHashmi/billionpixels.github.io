import { buildReconcileIndex, chequeStatus, ChequeStatus, invoiceStatus, isInvoice, lineResidual } from './engine';
import { monthsInPeriod, payrollTotals } from './operations';
import { agedBalance, postedItems, taxReport } from './reports';
import { Account, AppState, ID, Journal, Move, MoveLine, Partner, Payment, PayrollRun, Tax, VatCategory } from './types';
import { byId, daysBetween, isZero, round } from './utils';

// ---------------------------------------------------------------------------
// Customer / supplier outstanding
// ---------------------------------------------------------------------------

export interface OutstandingRow {
  partnerId?: ID;
  partner?: Partner;
  total: number;
  notDue: number;
  overdue: number;
  oldestDays: number;
  documents: number;
}

export function partnerOutstanding(state: AppState, kind: 'receivable' | 'payable', asOf: string): { rows: OutstandingRow[]; total: number; overdue: number } {
  const d = state.settings.decimals;
  const aged = agedBalance(state, kind, asOf);
  const rows = aged.rows.map((r) => ({
    partnerId: r.partnerId,
    partner: r.partner,
    total: r.total,
    notDue: r.buckets[0],
    overdue: round(r.total - r.buckets[0], d),
    oldestDays: Math.max(0, ...r.items.map((i) => i.days)),
    documents: r.items.length,
  }));
  return { rows, total: aged.total, overdue: round(aged.total - aged.totals[0], d) };
}

// ---------------------------------------------------------------------------
// Bank & cash position
// ---------------------------------------------------------------------------

export interface LiquidityRow {
  journal: Journal;
  balance: number;
  statementBalance: number;
  unreconciledCount: number;
}

export interface CashPosition {
  journals: LiquidityRow[];
  totalBooks: number;
  inTransit: { label: string; amount: number; accountId: ID }[];
  totalInTransit: number;
}

function accountBalances(state: AppState, asOf: string): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const it of postedItems(state, { to: asOf })) m.set(it.account.id, (m.get(it.account.id) ?? 0) + it.line.debit - it.line.credit);
  return m;
}

export function cashPosition(state: AppState, asOf: string): CashPosition {
  const d = state.settings.decimals;
  const bal = accountBalances(state, asOf);
  const st = state.settings;
  const journals = state.journals
    .filter((j) => j.active && (j.type === 'bank' || j.type === 'cash'))
    .map((journal) => {
      const lines = state.statementLines.filter((l) => l.journalId === journal.id && l.date <= asOf);
      return {
        journal,
        balance: round(bal.get(journal.defaultAccountId ?? '') ?? 0, d),
        statementBalance: round(lines.reduce((x, l) => x + l.amount, 0), d),
        unreconciledCount: lines.filter((l) => !l.reconciled).length,
      };
    });
  const transit: [string, ID][] = [
    ['Receipts not yet in bank', st.outstandingReceiptsAccountId],
    ['Payments not yet cleared', st.outstandingPaymentsAccountId],
    ['Cheques received – pending clearance', st.chequesReceivedAccountId],
    ['Cheques issued – pending clearance', st.chequesIssuedAccountId],
    ['Card payments awaiting settlement', st.cardClearingAccountId],
  ];
  const inTransit = transit.map(([label, accountId]) => ({ label, accountId, amount: round(bal.get(accountId) ?? 0, d) }));
  return {
    journals,
    totalBooks: round(journals.reduce((x, j) => x + j.balance, 0), d),
    inTransit,
    totalInTransit: round(inTransit.reduce((x, i) => x + i.amount, 0), d),
  };
}

// ---------------------------------------------------------------------------
// Pending collections / payments
// ---------------------------------------------------------------------------

export interface PendingDoc {
  move: Move;
  partner?: Partner;
  dueDate: string;
  residual: number;
  daysLate: number;
}

/** Open invoices (or bills) that are overdue or fall due on or before `until`. */
export function pendingDocuments(state: AppState, kind: 'customer' | 'supplier', asOf: string, until: string): PendingDoc[] {
  const idx = buildReconcileIndex(state.reconciles);
  const partners = byId(state.partners);
  const types = kind === 'customer' ? ['out_invoice', 'out_refund'] : ['in_invoice', 'in_refund'];
  const out: PendingDoc[] = [];
  for (const m of state.moves) {
    if (m.state !== 'posted' || !types.includes(m.moveType)) continue;
    const st = invoiceStatus(state, m, idx);
    if (isZero(st.residual, state.settings.decimals)) continue;
    const due = m.dueDate ?? m.date;
    if (due > until) continue;
    const sign = m.moveType.endsWith('refund') ? -1 : 1;
    out.push({ move: m, partner: m.partnerId ? partners.get(m.partnerId) : undefined, dueDate: due, residual: sign * st.residual, daysLate: Math.max(0, daysBetween(due, asOf)) });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ---------------------------------------------------------------------------
// Unallocated receipts and payments
// ---------------------------------------------------------------------------

export interface UnallocatedRow {
  payment?: Payment;
  move: Move;
  line: MoveLine;
  partner?: Partner;
  amount: number;
  kind: 'receipt' | 'payment';
}

/** Customer receipts and vendor payments not (fully) matched with any invoice or bill. */
export function unallocated(state: AppState): UnallocatedRow[] {
  const d = state.settings.decimals;
  const idx = buildReconcileIndex(state.reconciles);
  const partners = byId(state.partners);
  const st = state.settings;
  const out: UnallocatedRow[] = [];
  for (const m of state.moves) {
    if (m.state !== 'posted' || isInvoice(m.moveType)) continue;
    for (const l of m.lines) {
      if (l.kind !== 'payment_term' || (l.accountId !== st.receivableAccountId && l.accountId !== st.payableAccountId)) continue;
      const r = lineResidual(l, idx, d);
      if (isZero(r, d)) continue;
      // Credits on receivable = customer money received; debits on payable = advance to vendor.
      const isReceipt = l.accountId === st.receivableAccountId ? r < 0 : false;
      const isAdvance = l.accountId === st.payableAccountId ? r > 0 : false;
      if (!isReceipt && !isAdvance) continue;
      out.push({
        payment: m.origin === 'payment' ? state.payments.find((p) => p.id === m.originId) : undefined,
        move: m,
        line: l,
        partner: l.partnerId ? partners.get(l.partnerId) : undefined,
        amount: Math.abs(r),
        kind: isReceipt ? 'receipt' : 'payment',
      });
    }
  }
  return out.sort((a, b) => a.move.date.localeCompare(b.move.date));
}

// ---------------------------------------------------------------------------
// Cheques register
// ---------------------------------------------------------------------------

export interface ChequeRow {
  payment: Payment;
  partner?: Partner;
  status: ChequeStatus;
  direction: 'received' | 'issued';
}

export function chequeRegister(state: AppState, from?: string, to?: string): ChequeRow[] {
  const idx = buildReconcileIndex(state.reconciles);
  const partners = byId(state.partners);
  return state.payments
    .filter((p) => p.method === 'cheque' && (!from || p.date >= from) && (!to || p.date <= to))
    .map((p) => ({
      payment: p,
      partner: p.partnerId ? partners.get(p.partnerId) : undefined,
      status: chequeStatus(state, p, idx),
      direction: (p.paymentType === 'inbound' ? 'received' : 'issued') as ChequeRow['direction'],
    }))
    .sort((a, b) => (a.payment.chequeDate ?? a.payment.date).localeCompare(b.payment.chequeDate ?? b.payment.date));
}

// ---------------------------------------------------------------------------
// Bank reconciliation statement
// ---------------------------------------------------------------------------

export interface BankReconciliation {
  journal: Journal;
  statementBalance: number;
  /** Bank transactions not yet recorded in the books. */
  unrecordedInBooks: { date: string; label: string; amount: number }[];
  bookBalance: number;
  /** Receipts recorded in the books but not yet on the statement (deposits in transit). */
  depositsInTransit: { date: string; label: string; amount: number }[];
  /** Payments recorded in the books but not yet on the statement (unpresented cheques/transfers). */
  unpresentedPayments: { date: string; label: string; amount: number }[];
  /** Statement balance less transactions not yet recorded; equals the book balance when reconciled. */
  reconciledStatementBalance: number;
  /** Statement balance + deposits in transit − unpresented payments. */
  projectedBalance: number;
  difference: number;
}

export function bankReconciliation(state: AppState, journalId: ID, asOf: string): BankReconciliation {
  const d = state.settings.decimals;
  const journal = state.journals.find((j) => j.id === journalId)!;
  const st = state.settings;
  const lines = state.statementLines.filter((l) => l.journalId === journalId && l.date <= asOf);
  const statementBalance = round(lines.reduce((x, l) => x + l.amount, 0), d);
  const unrecordedInBooks = lines.filter((l) => !l.reconciled).map((l) => ({ date: l.date, label: l.label, amount: l.amount }));
  const bookBalance = round(accountBalances(state, asOf).get(journal.defaultAccountId ?? '') ?? 0, d);
  const idx = buildReconcileIndex(state.reconciles.filter((r) => r.date <= asOf));
  const transitAccounts = new Set([st.outstandingReceiptsAccountId, st.outstandingPaymentsAccountId, st.chequesReceivedAccountId, st.chequesIssuedAccountId, st.cardClearingAccountId]);
  const depositsInTransit: BankReconciliation['depositsInTransit'] = [];
  const unpresentedPayments: BankReconciliation['unpresentedPayments'] = [];
  for (const m of state.moves) {
    // Payments, salary transfers… recorded through the transit accounts of this bank journal.
    if (m.state !== 'posted' || m.journalId !== journalId || m.date > asOf || m.origin === 'statement') continue;
    for (const l of m.lines) {
      if (!transitAccounts.has(l.accountId)) continue;
      const r = lineResidual(l, idx, d);
      if (isZero(r, d)) continue;
      const item = { date: m.date, label: `${m.name}${l.label ? ` · ${l.label}` : ''}`, amount: Math.abs(r) };
      if (r > 0) depositsInTransit.push(item);
      else unpresentedPayments.push(item);
    }
  }
  const sumOf = (xs: { amount: number }[]) => xs.reduce((x, i) => x + i.amount, 0);
  const reconciledStatementBalance = round(statementBalance - sumOf(unrecordedInBooks), d);
  return {
    journal,
    statementBalance,
    unrecordedInBooks,
    bookBalance,
    depositsInTransit,
    unpresentedPayments,
    reconciledStatementBalance,
    projectedBalance: round(statementBalance + sumOf(depositsInTransit) - sumOf(unpresentedPayments), d),
    difference: round(reconciledStatementBalance - bookBalance, d),
  };
}

// ---------------------------------------------------------------------------
// Expenses, budgets, payroll
// ---------------------------------------------------------------------------

export interface ExpenseRow {
  account: Account;
  amount: number;
  previous: number;
  share: number;
}

/** Expenses by account (category) with the same-length previous period for comparison. */
export function expenseReport(state: AppState, from: string, to: string, prevFrom: string, prevTo: string): { rows: ExpenseRow[]; total: number; previousTotal: number } {
  const d = state.settings.decimals;
  const sumBy = (f: string, t: string) => {
    const m = new Map<ID, number>();
    for (const it of postedItems(state, { from: f, to: t })) {
      if (!it.account.type.startsWith('expense')) continue;
      m.set(it.account.id, (m.get(it.account.id) ?? 0) + it.line.debit - it.line.credit);
    }
    return m;
  };
  const cur = sumBy(from, to);
  const prev = sumBy(prevFrom, prevTo);
  const total = round([...cur.values()].reduce((x, v) => x + v, 0), d);
  const accounts = byId(state.accounts);
  const ids = new Set([...cur.keys(), ...prev.keys()]);
  const rows = [...ids]
    .map((id) => ({ account: accounts.get(id)!, amount: round(cur.get(id) ?? 0, d), previous: round(prev.get(id) ?? 0, d), share: 0 }))
    .filter((r) => r.account && !(isZero(r.amount, d) && isZero(r.previous, d)))
    .map((r) => ({ ...r, share: isZero(total, d) ? 0 : round((r.amount / total) * 100, 1) }))
    .sort((a, b) => b.amount - a.amount);
  return { rows, total, previousTotal: round([...prev.values()].reduce((x, v) => x + v, 0), d) };
}

export interface BudgetRow {
  account: Account;
  budget: number;
  actual: number;
  variance: number;
  /** Actual as % of budget. */
  achieved: number;
}

export function budgetVsActual(state: AppState, budgetId: ID, from: string, to: string): { rows: BudgetRow[]; income: BudgetRow; expense: BudgetRow; months: number } {
  const d = state.settings.decimals;
  const budget = state.budgets.find((b) => b.id === budgetId);
  const months = monthsInPeriod(from, to);
  const actual = new Map<ID, number>();
  for (const it of postedItems(state, { from, to })) {
    const sign = it.account.type.startsWith('income') ? -1 : 1;
    actual.set(it.account.id, (actual.get(it.account.id) ?? 0) + sign * (it.line.debit - it.line.credit));
  }
  const accounts = byId(state.accounts);
  const rows: BudgetRow[] = (budget?.lines ?? [])
    .filter((l) => accounts.get(l.accountId))
    .map((l) => {
      const b = round(l.monthly * months, d);
      const a = round(actual.get(l.accountId) ?? 0, d);
      return { account: accounts.get(l.accountId)!, budget: b, actual: a, variance: round(a - b, d), achieved: isZero(b, d) ? 0 : round((a / b) * 100, 1) };
    })
    .sort((x, y) => x.account.code.localeCompare(y.account.code));
  const total = (pred: (r: BudgetRow) => boolean, label: string): BudgetRow => {
    const rs = rows.filter(pred);
    const b = round(rs.reduce((x, r) => x + r.budget, 0), d);
    const a = round(rs.reduce((x, r) => x + r.actual, 0), d);
    return { account: { id: label, code: '', name: label, type: 'income', reconcile: false, active: true }, budget: b, actual: a, variance: round(a - b, d), achieved: isZero(b, d) ? 0 : round((a / b) * 100, 1) };
  };
  return {
    rows,
    income: total((r) => r.account.type.startsWith('income'), 'Total Income'),
    expense: total((r) => r.account.type.startsWith('expense'), 'Total Expenses'),
    months,
  };
}

export interface PayrollReportRow {
  employeeId: ID;
  name: string;
  basic: number;
  allowances: number;
  overtime: number;
  deductions: number;
  siEmployee: number;
  siEmployer: number;
  net: number;
}

export function payrollReport(state: AppState, from: string, to: string): { runs: PayrollRun[]; rows: PayrollReportRow[]; totals: ReturnType<typeof payrollTotals> } {
  const d = state.settings.decimals;
  const runs = state.payrollRuns.filter((r) => r.state !== 'draft' && r.date >= from && r.date <= to).sort((a, b) => a.month.localeCompare(b.month));
  const employees = byId(state.employees);
  const rows = new Map<ID, PayrollReportRow>();
  for (const run of runs) {
    for (const p of run.payslips) {
      const r = rows.get(p.employeeId) ?? { employeeId: p.employeeId, name: employees.get(p.employeeId)?.name ?? '?', basic: 0, allowances: 0, overtime: 0, deductions: 0, siEmployee: 0, siEmployer: 0, net: 0 };
      for (const k of ['basic', 'allowances', 'overtime', 'deductions', 'siEmployee', 'siEmployer', 'net'] as const) r[k] = round(r[k] + p[k], d);
      rows.set(p.employeeId, r);
    }
  }
  const totals = payrollTotals({ id: '', month: '', date: '', state: 'posted', payslips: runs.flatMap((r) => r.payslips) });
  return { runs, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)), totals };
}

// ---------------------------------------------------------------------------
// VAT return (Oman Tax Authority layout)
// ---------------------------------------------------------------------------

export interface VatReturnLine {
  key: string;
  label: string;
  base: number;
  vat: number;
}

export interface VatReturn {
  supplies: VatReturnLine[];
  purchases: VatReturnLine[];
  outputVat: number;
  inputVat: number;
  net: number;
}

const SUPPLY_LABELS: Partial<Record<VatCategory, string>> = {
  standard: 'Supplies taxed at the standard rate',
  zero: 'Zero-rated supplies (incl. exports)',
  exempt: 'Exempt supplies',
  out_of_scope: 'Out-of-scope supplies',
};

const PURCHASE_LABELS: Partial<Record<VatCategory, string>> = {
  standard: 'Purchases taxed at the standard rate',
  reverse_charge: 'Purchases subject to reverse charge (imported services)',
  import: 'Imports of goods (deferred VAT)',
  zero: 'Zero-rated purchases',
  exempt: 'Exempt purchases',
};

/**
 * VAT return grouped the way the Oman VAT return asks for it: supplies by treatment, VAT due
 * under the reverse charge, imports, and recoverable input VAT.
 */
export function vatReturn(state: AppState, from: string, to: string): VatReturn {
  const d = state.settings.decimals;
  const tr = taxReport(state, from, to);
  const group = (rows: { tax: Tax; base: number; amount: number; reverseCharge?: boolean }[], labels: Partial<Record<VatCategory, string>>) => {
    const m = new Map<string, VatReturnLine>();
    for (const r of rows) {
      const cat = r.tax.vatCategory ?? 'standard';
      const label = labels[cat] ?? labels.standard!;
      const line = m.get(cat) ?? { key: cat, label, base: 0, vat: 0 };
      line.base = round(line.base + r.base, d);
      line.vat = round(line.vat + r.amount, d);
      m.set(cat, line);
    }
    return Object.keys(labels).map((k) => m.get(k)).filter((x): x is VatReturnLine => !!x);
  };
  const supplies = group(tr.sales.filter((r) => !r.reverseCharge), SUPPLY_LABELS);
  const rcOutput = tr.sales.filter((r) => r.reverseCharge);
  const rcLines: VatReturnLine[] = (['reverse_charge', 'import'] as VatCategory[])
    .map((cat) => {
      const rs = rcOutput.filter((r) => r.tax.vatCategory === cat);
      if (!rs.length) return undefined;
      return {
        key: `${cat}_due`,
        label: cat === 'import' ? 'VAT due on imports of goods (deferred)' : 'VAT due under the reverse charge',
        base: round(rs.reduce((x, r) => x + r.base, 0), d),
        vat: round(rs.reduce((x, r) => x + r.amount, 0), d),
      };
    })
    .filter((x): x is VatReturnLine => !!x);
  const purchases = group(tr.purchases, PURCHASE_LABELS);
  const outputVat = round([...supplies, ...rcLines].reduce((x, l) => x + l.vat, 0), d);
  const inputVat = round(purchases.reduce((x, l) => x + l.vat, 0), d);
  return { supplies: [...supplies, ...rcLines], purchases, outputVat, inputVat, net: round(outputVat - inputVat, d) };
}

