// Bank statement lines and bank reconciliation.
import {
  AccountingError,
  AppState,
  ID,
  Move,
  MoveLine,
  StatementLine,
} from '../types';
import { isValidISODate, isZero, newId, round } from '../utils';
import { checkLockDate, getJournal, nextSequence, replace } from './core';
import { buildReconcileIndex, findLine, lineResidual, OpenItem, openItems, reconcileLines, unreconcileMove } from './reconcile';

// ---------------------------------------------------------------------------
// Bank statements & reconciliation
// ---------------------------------------------------------------------------

export function saveStatementLine(state: AppState, line: StatementLine): AppState {
  const existing = state.statementLines.find((s) => s.id === line.id);
  if (existing?.reconciled) throw new AccountingError('Undo the reconciliation before editing this transaction.');
  if (!isValidISODate(line.date)) throw new AccountingError('Invalid date.');
  if (isZero(line.amount, state.settings.decimals)) throw new AccountingError('Amount cannot be zero.');
  return { ...state, statementLines: replace(state.statementLines, { ...line, reconciled: false, moveId: undefined }) };
}

export function deleteStatementLine(state: AppState, id: ID): AppState {
  const sl = state.statementLines.find((s) => s.id === id);
  if (sl?.reconciled) throw new AccountingError('Undo the reconciliation before deleting this transaction.');
  return { ...state, statementLines: state.statementLines.filter((s) => s.id !== id) };
}

export interface WriteOff {
  accountId: ID;
  label: string;
  taxId?: ID;
  analyticAccountId?: ID;
}

/**
 * Reconcile a bank transaction with open items (outstanding payments, invoices, bills)
 * and book any remainder on a counterpart account.
 */
export function reconcileStatementLine(
  state: AppState,
  statementLineId: ID,
  matchLineIds: ID[],
  writeOff?: WriteOff,
  /** Settle the selected items completely and book any difference (fees, discounts) on the write-off account. */
  fullMatch = false,
): AppState {
  const { decimals } = state.settings;
  const sl = state.statementLines.find((s) => s.id === statementLineId);
  if (!sl) throw new AccountingError('Bank transaction not found.');
  if (sl.reconciled) throw new AccountingError('This transaction is already reconciled.');
  checkLockDate(state, sl.date);
  const journal = getJournal(state, sl.journalId);
  if (!journal.defaultAccountId) throw new AccountingError('The bank journal has no bank account.');

  const idx = buildReconcileIndex(state.reconciles);
  const amount = round(sl.amount, decimals);
  let remaining = amount; // amount still to be explained, in bank direction
  const lines: MoveLine[] = [
    {
      id: newId(),
      accountId: journal.defaultAccountId,
      partnerId: sl.partnerId,
      label: sl.label,
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? -amount : 0,
      kind: 'other',
    },
  ];
  const pairs: [ID, ID][] = [];
  for (const id of matchLineIds) {
    const { move, line } = findLine(state, id);
    if (move.state !== 'posted') throw new AccountingError(`${move.name} is not posted.`);
    const open = lineResidual(line, idx, decimals);
    // Money in settles debit items (open > 0) and money out settles credit items.
    if (Math.sign(open) !== Math.sign(amount)) continue;
    if (!fullMatch && (isZero(remaining, decimals) || Math.sign(remaining) !== Math.sign(amount))) continue;
    const used = fullMatch ? open : Math.sign(open) * Math.min(Math.abs(open), Math.abs(remaining));
    const cp: MoveLine = {
      id: newId(),
      accountId: line.accountId,
      partnerId: line.partnerId ?? sl.partnerId,
      label: move.name,
      debit: used < 0 ? -used : 0,
      credit: used > 0 ? used : 0,
      kind: 'payment_term',
    };
    lines.push(cp);
    pairs.push([cp.id, line.id]);
    remaining = round(remaining - used, decimals);
  }

  if (!isZero(remaining, decimals)) {
    if (!writeOff) throw new AccountingError(`${round(remaining, decimals)} is still unexplained. Choose a counterpart account.`);
    if (fullMatch && Math.sign(remaining) !== Math.sign(amount) && !writeOff.accountId) throw new AccountingError('Choose an account for the difference.');
    const tax = writeOff.taxId ? state.taxes.find((t) => t.id === writeOff.taxId) : undefined;
    let base = remaining;
    if (tax && tax.amountType === 'percent' && tax.amount && !tax.reverseCharge) {
      // Amount on the bank statement is tax-included.
      base = round(remaining / (1 + tax.amount / 100), decimals);
      const taxAmount = round(remaining - base, decimals);
      lines.push({
        id: newId(),
        accountId: tax.accountId,
        partnerId: sl.partnerId,
        label: tax.label || tax.name,
        debit: taxAmount < 0 ? -taxAmount : 0,
        credit: taxAmount > 0 ? taxAmount : 0,
        kind: 'tax',
        taxId: tax.id,
      });
    }
    lines.push({
      id: newId(),
      accountId: writeOff.accountId,
      partnerId: sl.partnerId,
      label: writeOff.label || sl.label,
      debit: base < 0 ? -base : 0,
      credit: base > 0 ? base : 0,
      kind: 'product',
      taxIds: tax ? [tax.id] : undefined,
      analyticAccountId: writeOff.analyticAccountId,
    });
  }

  const seq = nextSequence(state, journal.code, sl.date);
  let next = seq.state;
  const move: Move = {
    id: newId(),
    moveType: 'entry',
    name: seq.name,
    state: 'posted',
    journalId: journal.id,
    partnerId: sl.partnerId,
    date: sl.date,
    ref: sl.ref || sl.label,
    narration: '',
    invoiceLines: [],
    lines,
    origin: 'statement',
    originId: sl.id,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
  };
  next = {
    ...next,
    moves: [...next.moves, move],
    statementLines: replace(next.statementLines, { ...sl, reconciled: true, moveId: move.id }),
  };
  for (const [a, b] of pairs) next = reconcileLines(next, [a, b], sl.date);
  return next;
}

export function undoStatementReconciliation(state: AppState, statementLineId: ID): AppState {
  const sl = state.statementLines.find((s) => s.id === statementLineId);
  if (!sl || !sl.reconciled || !sl.moveId) return state;
  checkLockDate(state, sl.date);
  const next = unreconcileMove(state, sl.moveId);
  return {
    ...next,
    moves: next.moves.filter((m) => m.id !== sl.moveId),
    statementLines: replace(next.statementLines, { ...sl, reconciled: false, moveId: undefined }),
  };
}

/** Candidate open items for a bank transaction, best matches first. */
export function suggestMatches(state: AppState, sl: StatementLine): OpenItem[] {
  const { decimals } = state.settings;
  const s = state.settings;
  const accounts = new Set([
    s.receivableAccountId,
    s.payableAccountId,
    s.outstandingReceiptsAccountId,
    s.outstandingPaymentsAccountId,
    s.chequesReceivedAccountId,
    s.chequesIssuedAccountId,
    s.cardClearingAccountId,
  ]);
  const items = openItems(state).filter(
    (o) => accounts.has(o.line.accountId) && Math.sign(o.residual) === Math.sign(sl.amount),
  );
  const label = sl.label.toLowerCase();
  const score = (o: OpenItem) => {
    let sc = 0;
    if (isZero(Math.abs(o.residual) - Math.abs(sl.amount), decimals)) sc += 4;
    if (sl.partnerId && o.line.partnerId === sl.partnerId) sc += 3;
    if (o.move.name !== '/' && label.includes(o.move.name.toLowerCase())) sc += 5;
    if (o.move.ref && label.includes(o.move.ref.toLowerCase())) sc += 2;
    if (o.move.origin === 'payment') sc += 1;
    return sc;
  };
  return items.map((o) => ({ o, sc: score(o) })).sort((a, b) => b.sc - a.sc).map((x) => x.o);
}
