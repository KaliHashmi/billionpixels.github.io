// Dashboard figures and journal cards.
import { buildReconcileIndex, invoiceStatus, isInvoice, lineResidual } from '../engine';
import { AppState, ID, Move } from '../types';
import { fiscalYear, isZero, round, today } from '../utils';
import { balancesByAccount, postedItems } from './base';
import { profitAndLoss } from './statements';
import { agedBalance } from './ledgers';

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
