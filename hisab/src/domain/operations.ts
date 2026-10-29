import { checkLockDate, getJournal, liquidityAccountFor, nextSequence } from './engine';
import { AccountingError, AppState, CashClosing, Employee, ID, Move, MoveLine, Payslip, PayrollRun } from './types';
import { isValidISODate, isZero, newId, round } from './utils';

function postedMove(state: AppState, journalId: ID, date: string, ref: string, lines: MoveLine[], origin: Move['origin'], originId: ID): { state: AppState; move: Move } {
  const journal = getJournal(state, journalId);
  const seq = nextSequence(state, journal.code, date);
  const move: Move = {
    id: newId(),
    moveType: 'entry',
    name: seq.name,
    state: 'posted',
    journalId,
    date,
    ref,
    narration: '',
    invoiceLines: [],
    lines,
    origin,
    originId,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
  };
  return { state: { ...seq.state, moves: [...seq.state.moves, move] }, move };
}

function line(accountId: ID, label: string, amount: number, partnerId?: ID): MoveLine {
  return { id: newId(), accountId, label, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, kind: 'other', partnerId };
}

// ---------------------------------------------------------------------------
// Daily cash closing
// ---------------------------------------------------------------------------

export interface DaySummary {
  /** Cash account balance at the end of the day according to the books. */
  expectedCash: number;
  openingCash: number;
  receipts: Record<'cash' | 'bank_transfer' | 'card' | 'cheque', number>;
  paymentsOut: number;
  cardReceipts: number;
}

export function daySummary(state: AppState, journalId: ID, date: string): DaySummary {
  const d = state.settings.decimals;
  const journal = getJournal(state, journalId);
  const cashAccount = journal.defaultAccountId;
  let opening = 0;
  let expected = 0;
  for (const m of state.moves) {
    if (m.state !== 'posted' || m.date > date) continue;
    for (const l of m.lines) {
      if (l.accountId !== cashAccount) continue;
      expected += l.debit - l.credit;
      if (m.date < date) opening += l.debit - l.credit;
    }
  }
  const receipts = { cash: 0, bank_transfer: 0, card: 0, cheque: 0 };
  let paymentsOut = 0;
  for (const p of state.payments) {
    if (p.state !== 'posted' || p.date !== date) continue;
    if (p.paymentType === 'inbound') receipts[p.method] = round(receipts[p.method] + p.amount, d);
    else if (p.journalId === journalId) paymentsOut = round(paymentsOut + p.amount, d);
  }
  return { expectedCash: round(expected, d), openingCash: round(opening, d), receipts, paymentsOut, cardReceipts: receipts.card };
}

export interface CashClosingInput {
  date: string;
  journalId: ID;
  counted: number;
  cardSettled: number;
  notes: string;
}

/** Close the cash drawer for a day; any shortage/overage is booked on the cash difference account. */
export function closeCashDay(state: AppState, input: CashClosingInput): AppState {
  const d = state.settings.decimals;
  if (!isValidISODate(input.date)) throw new AccountingError('Invalid date.');
  const journal = getJournal(state, input.journalId);
  if (journal.type !== 'cash' || !journal.defaultAccountId) throw new AccountingError('Choose a cash journal.');
  if (state.cashClosings.some((c) => c.journalId === input.journalId && c.date === input.date)) {
    throw new AccountingError('This day is already closed for this cash journal.');
  }
  const sum = daySummary(state, input.journalId, input.date);
  const difference = round(input.counted - sum.expectedCash, d);
  const closing: CashClosing = {
    id: newId(),
    date: input.date,
    journalId: input.journalId,
    expected: sum.expectedCash,
    counted: round(input.counted, d),
    difference,
    cardExpected: sum.cardReceipts,
    cardSettled: round(input.cardSettled, d),
    notes: input.notes,
  };
  let next = state;
  if (!isZero(difference, d)) {
    checkLockDate(state, input.date);
    const label = difference > 0 ? 'Cash overage' : 'Cash shortage';
    const res = postedMove(next, journal.id, input.date, `${label} ${input.date}`, [
      line(journal.defaultAccountId, label, difference),
      line(state.settings.cashDifferenceAccountId, label, -difference),
    ], 'cash_closing', closing.id);
    next = res.state;
    closing.moveId = res.move.id;
  }
  return { ...next, cashClosings: [...next.cashClosings, closing] };
}

export function reopenCashDay(state: AppState, closingId: ID): AppState {
  const c = state.cashClosings.find((x) => x.id === closingId);
  if (!c) return state;
  checkLockDate(state, c.date);
  return {
    ...state,
    moves: c.moveId ? state.moves.filter((m) => m.id !== c.moveId) : state.moves,
    cashClosings: state.cashClosings.filter((x) => x.id !== closingId),
  };
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export function employeeGross(e: Employee): number {
  return e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowance;
}

export function computePayslip(state: AppState, e: Employee, overtime = 0, deductions = 0): Payslip {
  const d = state.settings.decimals;
  const allowances = round(e.housingAllowance + e.transportAllowance + e.otherAllowance, d);
  const gross = round(e.basicSalary + allowances, d);
  const insured = e.socialInsurance;
  const siEmployee = insured ? round((gross * state.settings.siEmployeeRate) / 100, d) : 0;
  const siEmployer = insured ? round((gross * state.settings.siEmployerRate) / 100, d) : 0;
  return {
    employeeId: e.id,
    basic: round(e.basicSalary, d),
    allowances,
    overtime: round(overtime, d),
    deductions: round(deductions, d),
    siEmployee,
    siEmployer,
    net: round(gross + overtime - deductions - siEmployee, d),
  };
}

export function recomputePayslip(state: AppState, p: Payslip): Payslip {
  const e = state.employees.find((x) => x.id === p.employeeId);
  if (!e) return p;
  return computePayslip(state, e, p.overtime, p.deductions);
}

export function newPayrollRun(state: AppState, month: string): PayrollRun {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new AccountingError('Month must be YYYY-MM.');
  if (state.payrollRuns.some((r) => r.month === month)) throw new AccountingError(`Payroll for ${month} already exists.`);
  const employees = state.employees.filter((e) => e.active);
  if (!employees.length) throw new AccountingError('Add employees first.');
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    id: newId(),
    month,
    date: `${month}-${String(lastDay).padStart(2, '0')}`,
    state: 'draft',
    payslips: employees.map((e) => computePayslip(state, e)),
  };
}

export function savePayrollRun(state: AppState, run: PayrollRun): AppState {
  const existing = state.payrollRuns.find((r) => r.id === run.id);
  if (existing && existing.state !== 'draft') throw new AccountingError('Posted payroll cannot be modified.');
  const runs = existing ? state.payrollRuns.map((r) => (r.id === run.id ? run : r)) : [...state.payrollRuns, run];
  return { ...state, payrollRuns: runs };
}

export function payrollTotals(run: PayrollRun) {
  const t = { basic: 0, allowances: 0, overtime: 0, deductions: 0, siEmployee: 0, siEmployer: 0, net: 0, gross: 0, cost: 0 };
  for (const p of run.payslips) {
    t.basic += p.basic;
    t.allowances += p.allowances;
    t.overtime += p.overtime;
    t.deductions += p.deductions;
    t.siEmployee += p.siEmployee;
    t.siEmployer += p.siEmployer;
    t.net += p.net;
  }
  t.gross = t.basic + t.allowances + t.overtime;
  t.cost = t.gross + t.siEmployer;
  return t;
}

/** Book the payroll: salary expense and employer social insurance against salaries/SI payable. */
export function postPayroll(state: AppState, runId: ID): AppState {
  const d = state.settings.decimals;
  const run = state.payrollRuns.find((r) => r.id === runId);
  if (!run) throw new AccountingError('Payroll not found.');
  if (run.state !== 'draft') throw new AccountingError('This payroll is already posted.');
  checkLockDate(state, run.date);
  const st = state.settings;
  const t = payrollTotals(run);
  const label = `Payroll ${run.month}`;
  const lines = [
    line(st.salaryExpenseAccountId, label, round(t.gross, d)),
    line(st.siExpenseAccountId, `${label} - employer social insurance`, round(t.siEmployer, d)),
    line(st.salariesPayableAccountId, `${label} - net salaries`, -round(t.net, d)),
    line(st.siPayableAccountId, `${label} - social insurance`, -round(t.siEmployee + t.siEmployer, d)),
    line(st.employeeAdvancesAccountId, `${label} - deductions`, -round(t.deductions, d)),
  ].filter((l) => !isZero(l.debit + l.credit, d));
  const general = state.journals.find((j) => j.type === 'general' && j.active);
  if (!general) throw new AccountingError('No miscellaneous journal configured.');
  const res = postedMove(state, general.id, run.date, label, lines, 'payroll', run.id);
  return { ...res.state, payrollRuns: res.state.payrollRuns.map((r) => (r.id === runId ? { ...r, state: 'posted', moveId: res.move.id, issued: true } : r)) };
}

/** Pay net salaries from a bank (bank transfer / WPS) or cash journal. */
export function payPayroll(state: AppState, runId: ID, journalId: ID, date: string): AppState {
  const d = state.settings.decimals;
  const run = state.payrollRuns.find((r) => r.id === runId);
  if (!run) throw new AccountingError('Payroll not found.');
  if (run.state !== 'posted') throw new AccountingError(run.state === 'draft' ? 'Post the payroll first.' : 'Salaries are already paid.');
  if (!isValidISODate(date)) throw new AccountingError('Invalid date.');
  checkLockDate(state, date);
  const journal = getJournal(state, journalId);
  if (journal.type !== 'bank' && journal.type !== 'cash') throw new AccountingError('Choose a bank or cash journal.');
  const net = round(payrollTotals(run).net, d);
  const label = `Salaries ${run.month}`;
  const res = postedMove(state, journalId, date, label, [
    line(state.settings.salariesPayableAccountId, label, net),
    line(liquidityAccountFor(state, journal, false), label, -net),
  ], 'payroll', run.id);
  return { ...res.state, payrollRuns: res.state.payrollRuns.map((r) => (r.id === runId ? { ...r, state: 'paid', paymentMoveId: res.move.id } : r)) };
}

export function resetPayroll(state: AppState, runId: ID): AppState {
  const run = state.payrollRuns.find((r) => r.id === runId);
  if (!run || run.state === 'draft') return state;
  const ids = [run.moveId, run.paymentMoveId].filter(Boolean) as ID[];
  for (const id of ids) {
    const m = state.moves.find((x) => x.id === id);
    if (m) checkLockDate(state, m.date);
  }
  if (run.paymentMoveId && state.reconciles.some((r) => r.debitMoveId === run.paymentMoveId || r.creditMoveId === run.paymentMoveId)) {
    throw new AccountingError('The salary payment is matched with a bank statement. Undo that first.');
  }
  return {
    ...state,
    moves: state.moves.filter((m) => !ids.includes(m.id)),
    payrollRuns: state.payrollRuns.map((r) => (r.id === runId ? { ...r, state: 'draft', moveId: undefined, paymentMoveId: undefined } : r)),
  };
}

/** Remove a payroll; a posted or paid one has its journal entries removed first. */
export function deletePayrollRun(state: AppState, runId: ID): AppState {
  const next = resetPayroll(state, runId);
  return { ...next, payrollRuns: next.payrollRuns.filter((r) => r.id !== runId) };
}

/** Number of calendar months touched by a period (used to scale monthly budgets). */
export function monthsInPeriod(from: string, to: string): number {
  if (to < from) return 0;
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

