// Matching journal items and invoice payment status.
import { computeInvoiceTotals } from '../tax';
import {
  AccountingError,
  AppState,
  ID,
  Move,
  MoveLine,
  PaymentState,
  Reconcile,
} from '../types';
import { byId, isZero, newId, round, today } from '../utils';

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export type ReconcileIndex = Map<ID, number>;

/** Matched amount per journal item. */
export function buildReconcileIndex(reconciles: Reconcile[]): ReconcileIndex {
  const idx: ReconcileIndex = new Map();
  for (const r of reconciles) {
    idx.set(r.debitLineId, (idx.get(r.debitLineId) ?? 0) + r.amount);
    idx.set(r.creditLineId, (idx.get(r.creditLineId) ?? 0) + r.amount);
  }
  return idx;
}

/** Signed open amount of a journal item (debit positive). */
export function lineResidual(line: MoveLine, idx: ReconcileIndex, decimals = 2): number {
  const balance = line.debit - line.credit;
  const matched = idx.get(line.id) ?? 0;
  return round(balance > 0 ? balance - matched : balance + matched, decimals);
}

export interface OpenItem {
  move: Move;
  line: MoveLine;
  residual: number;
}

/** Posted, not fully reconciled items on reconcilable accounts. */
export function openItems(state: AppState, filter: { accountId?: ID; partnerId?: ID } = {}): OpenItem[] {
  const { decimals } = state.settings;
  const idx = buildReconcileIndex(state.reconciles);
  const reconcilable = new Set(state.accounts.filter((a) => a.reconcile).map((a) => a.id));
  const out: OpenItem[] = [];
  for (const move of state.moves) {
    if (move.state !== 'posted') continue;
    for (const line of move.lines) {
      if (!reconcilable.has(line.accountId)) continue;
      if (filter.accountId && line.accountId !== filter.accountId) continue;
      if (filter.partnerId && line.partnerId !== filter.partnerId) continue;
      const residual = lineResidual(line, idx, decimals);
      if (!isZero(residual, decimals)) out.push({ move, line, residual });
    }
  }
  return out.sort((a, b) => (a.line.dateMaturity ?? a.move.date).localeCompare(b.line.dateMaturity ?? b.move.date));
}

/** @internal shared by the engine modules */
export function findLine(state: AppState, lineId: ID): { move: Move; line: MoveLine } {
  for (const move of state.moves) {
    const line = move.lines.find((l) => l.id === lineId);
    if (line) return { move, line };
  }
  throw new AccountingError('Journal item not found.');
}

/** Match journal items together (debits against credits, oldest first). */
export function reconcileLines(state: AppState, lineIds: ID[], date = today()): AppState {
  const { decimals } = state.settings;
  const idx = buildReconcileIndex(state.reconciles);
  // A line listed twice would be matched twice.
  const items = [...new Set(lineIds)].map((id) => findLine(state, id));
  if (items.some((i) => i.move.state !== 'posted')) throw new AccountingError('Only posted journal items can be reconciled.');
  const accountIds = new Set(items.map((i) => i.line.accountId));
  if (accountIds.size > 1) throw new AccountingError('Journal items must belong to the same account to be reconciled.');
  const account = state.accounts.find((a) => a.id === items[0]?.line.accountId);
  if (account && !account.reconcile) throw new AccountingError(`Account ${account.code} does not allow reconciliation.`);

  const debits = items
    .map((i) => ({ ...i, open: lineResidual(i.line, idx, decimals) }))
    .filter((i) => i.open > 0);
  const credits = items
    .map((i) => ({ ...i, open: -lineResidual(i.line, idx, decimals) }))
    .filter((i) => i.open > 0);
  const created: Reconcile[] = [];
  let di = 0;
  let ci = 0;
  while (di < debits.length && ci < credits.length) {
    const d = debits[di];
    const c = credits[ci];
    const amount = round(Math.min(d.open, c.open), decimals);
    if (amount > 0) {
      created.push({
        id: newId(),
        debitLineId: d.line.id,
        creditLineId: c.line.id,
        debitMoveId: d.move.id,
        creditMoveId: c.move.id,
        amount,
        date,
      });
    }
    d.open = round(d.open - amount, decimals);
    c.open = round(c.open - amount, decimals);
    if (isZero(d.open, decimals)) di++;
    if (isZero(c.open, decimals)) ci++;
  }
  return { ...state, reconciles: [...state.reconciles, ...created] };
}

export function unreconcileMove(state: AppState, moveId: ID): AppState {
  return {
    ...state,
    reconciles: state.reconciles.filter((r) => r.debitMoveId !== moveId && r.creditMoveId !== moveId),
  };
}

export function unreconcilePair(state: AppState, moveA: ID, moveB: ID): AppState {
  return {
    ...state,
    reconciles: state.reconciles.filter(
      (r) => !((r.debitMoveId === moveA && r.creditMoveId === moveB) || (r.debitMoveId === moveB && r.creditMoveId === moveA)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Invoice status
// ---------------------------------------------------------------------------

export interface InvoiceStatus {
  total: number;
  residual: number;
  paymentState: PaymentState;
  overdue: boolean;
}

export function invoiceStatus(state: AppState, move: Move, idx?: ReconcileIndex): InvoiceStatus {
  const { decimals } = state.settings;
  if (move.state !== 'posted') {
    const totals = computeInvoiceTotals(move.invoiceLines, byId(state.taxes), decimals);
    return { total: totals.total, residual: totals.total, paymentState: 'not_paid', overdue: false };
  }
  const index = idx ?? buildReconcileIndex(state.reconciles);
  const termLines = move.lines.filter((l) => l.kind === 'payment_term');
  const total = round(termLines.reduce((s, l) => s + l.debit + l.credit, 0), decimals);
  const residual = round(Math.abs(termLines.reduce((s, l) => s + lineResidual(l, index, decimals), 0)), decimals);
  let paymentState: PaymentState = 'not_paid';
  if (isZero(residual, decimals)) {
    const counterpartMoves = state.reconciles
      .filter((r) => r.debitMoveId === move.id || r.creditMoveId === move.id)
      .map((r) => (r.debitMoveId === move.id ? r.creditMoveId : r.debitMoveId));
    const reversed = state.moves.some((m) => m.reversedEntryId === move.id && counterpartMoves.includes(m.id));
    if (reversed) paymentState = 'reversed';
    else {
      // "In payment" while the payment has not been matched with a bank statement yet.
      const st = state.settings;
      const outstanding = new Set([st.outstandingReceiptsAccountId, st.outstandingPaymentsAccountId, st.chequesReceivedAccountId, st.chequesIssuedAccountId, st.cardClearingAccountId]);
      const pending = counterpartMoves.some((mid) => {
        const m = state.moves.find((x) => x.id === mid);
        if (!m || m.origin !== 'payment') return false;
        return m.lines.some((l) => outstanding.has(l.accountId) && !isZero(lineResidual(l, index, decimals), decimals));
      });
      paymentState = pending ? 'in_payment' : 'paid';
    }
  } else if (residual < total) paymentState = 'partial';
  const overdue = !isZero(residual, decimals) && !!move.dueDate && move.dueDate < today();
  return { total, residual, paymentState, overdue };
}
