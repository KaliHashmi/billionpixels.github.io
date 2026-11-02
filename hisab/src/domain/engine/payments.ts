// Receipts and payment vouchers, cheques, outstanding credits.
import {
  AccountingError,
  AppState,
  ID,
  Journal,
  Move,
  MoveLine,
  Payment,
  PaymentMethod,
} from '../types';
import { isValidISODate, isZero, newId, round } from '../utils';
import { checkLockDate, getJournal, getMove, isInvoice, nextSequence, replace } from './core';
import { buildReconcileIndex, lineResidual, OpenItem, openItems, ReconcileIndex, reconcileLines, unreconcileMove } from './reconcile';

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentInput {
  paymentType: 'inbound' | 'outbound';
  partnerType: 'customer' | 'supplier' | 'other';
  partnerId?: ID;
  amount: number;
  date: string;
  journalId: ID;
  memo: string;
  method?: PaymentMethod;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  /** partnerType 'other': income/expense account and optional tax (amount is tax-included). */
  counterpartAccountId?: ID;
  taxId?: ID;
  analyticAccountId?: ID;
  /** Invoices/bills to match with the payment. */
  moveIds?: ID[];
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  cheque: 'Cheque',
};

/**
 * Account receiving the money side of a payment:
 * cash journal → cash account; cheques → cheques under collection / issued (until cleared);
 * card receipts → card clearing (until the acquirer settles); transfers → outstanding receipts/payments
 * (until matched with the bank statement).
 */
export function liquidityAccountFor(state: AppState, journal: Journal, inbound: boolean, method: PaymentMethod = 'bank_transfer'): ID {
  if (journal.type === 'cash') {
    if (!journal.defaultAccountId) throw new AccountingError(`Journal ${journal.name} has no cash account.`);
    return journal.defaultAccountId;
  }
  const st = state.settings;
  if (method === 'cheque') return inbound ? st.chequesReceivedAccountId : st.chequesIssuedAccountId;
  if (method === 'card' && inbound) return st.cardClearingAccountId;
  return inbound ? st.outstandingReceiptsAccountId : st.outstandingPaymentsAccountId;
}

/** Number and ids an edited payment keeps. */
interface PaymentIdentity {
  paymentId: ID;
  moveId: ID;
  name: string;
}

export function registerPayment(state: AppState, input: PaymentInput, keep?: PaymentIdentity): { state: AppState; payment: Payment } {
  const { decimals } = state.settings;
  const amount = round(input.amount, decimals);
  if (!(amount > 0)) throw new AccountingError('The payment amount must be positive.');
  if (!isValidISODate(input.date)) throw new AccountingError('Invalid payment date.');
  checkLockDate(state, input.date);
  const journal = getJournal(state, input.journalId);
  if (journal.type !== 'bank' && journal.type !== 'cash') throw new AccountingError('Payments must use a bank or cash journal.');
  const method: PaymentMethod = journal.type === 'cash' ? 'cash' : input.method === 'cash' || !input.method ? 'bank_transfer' : input.method;
  if (method === 'cheque' && !input.chequeNumber?.trim()) throw new AccountingError('Enter the cheque number.');
  const inbound = input.paymentType === 'inbound';
  const liquidity = liquidityAccountFor(state, journal, inbound, method);
  const label = input.memo || (inbound ? 'Receipt' : 'Payment');
  const dc = (v: number) => ({ debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 });
  const s = inbound ? 1 : -1;

  const lines: MoveLine[] = [
    { id: newId(), accountId: liquidity, partnerId: input.partnerId, label, ...dc(s * amount), kind: 'other' },
  ];
  let counterpartLineId: ID | undefined;
  if (input.partnerType === 'other') {
    if (!input.counterpartAccountId) throw new AccountingError('Choose the income or expense account.');
    const tax = input.taxId ? state.taxes.find((t) => t.id === input.taxId) : undefined;
    let base = amount;
    if (tax && tax.amountType === 'percent' && tax.amount && !tax.reverseCharge) {
      base = round(amount / (1 + tax.amount / 100), decimals);
      lines.push({ id: newId(), accountId: tax.accountId, partnerId: input.partnerId, label: tax.label || tax.name, ...dc(-s * round(amount - base, decimals)), kind: 'tax', taxId: tax.id });
    }
    lines.push({
      id: newId(),
      accountId: input.counterpartAccountId,
      partnerId: input.partnerId,
      label,
      ...dc(-s * base),
      kind: 'product',
      taxIds: tax ? [tax.id] : undefined,
      analyticAccountId: input.analyticAccountId,
    });
  } else {
    const counterpart = input.partnerType === 'customer' ? state.settings.receivableAccountId : state.settings.payableAccountId;
    counterpartLineId = newId();
    lines.push({ id: counterpartLineId, accountId: counterpart, partnerId: input.partnerId, label, ...dc(-s * amount), kind: 'payment_term', dateMaturity: input.date });
  }

  const seq = keep ? { state, name: keep.name } : nextSequence(state, inbound ? 'RV' : 'PV', input.date);
  let next = seq.state;
  const paymentId = keep?.paymentId ?? newId();
  const move: Move = {
    id: keep?.moveId ?? newId(),
    moveType: 'entry',
    name: seq.name,
    state: 'posted',
    journalId: journal.id,
    partnerId: input.partnerId,
    date: input.date,
    ref: input.memo,
    narration: '',
    invoiceLines: [],
    lines,
    origin: 'payment',
    originId: paymentId,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
  };
  const payment: Payment = {
    id: paymentId,
    name: seq.name,
    paymentType: input.paymentType,
    partnerType: input.partnerType,
    partnerId: input.partnerId,
    amount,
    date: input.date,
    journalId: journal.id,
    memo: input.memo,
    method,
    chequeNumber: method === 'cheque' ? input.chequeNumber?.trim() : undefined,
    chequeBank: method === 'cheque' ? input.chequeBank : undefined,
    chequeDate: method === 'cheque' ? input.chequeDate || input.date : undefined,
    counterpartAccountId: input.partnerType === 'other' ? input.counterpartAccountId : undefined,
    taxId: input.partnerType === 'other' ? input.taxId : undefined,
    state: 'posted',
    moveId: move.id,
  };
  next = { ...next, moves: [...next.moves, move], payments: [...next.payments, payment] };

  if (input.moveIds?.length && counterpartLineId) {
    const counterpart = lines.find((l) => l.id === counterpartLineId)!.accountId;
    const targetIds: ID[] = [];
    for (const mid of input.moveIds) {
      const inv = getMove(next, mid);
      if (inv.state !== 'posted') throw new AccountingError(`${inv.name} is not posted.`);
      for (const l of inv.lines) if (l.kind === 'payment_term' && l.accountId === counterpart) targetIds.push(l.id);
    }
    next = reconcileLines(next, [...targetIds, counterpartLineId], input.date);
  }
  return { state: next, payment };
}

/** The money-side journal item of a payment. */
export function paymentLiquidityLine(state: AppState, payment: Payment): MoveLine | undefined {
  return state.moves.find((m) => m.id === payment.moveId)?.lines.find((l) => l.kind === 'other');
}

export type ChequeStatus = 'pending' | 'cleared' | 'bounced' | 'cancelled';

export function chequeStatus(state: AppState, payment: Payment, idx?: ReconcileIndex): ChequeStatus {
  if (payment.bounced) return 'bounced';
  if (payment.state === 'cancel') return 'cancelled';
  const line = paymentLiquidityLine(state, payment);
  if (!line) return 'pending';
  return isZero(lineResidual(line, idx ?? buildReconcileIndex(state.reconciles), state.settings.decimals), state.settings.decimals) ? 'cleared' : 'pending';
}

/**
 * Mark a cheque as cleared by the bank without a bank statement:
 * books it on the bank account and settles the cheques-in-transit item.
 */
export function clearCheque(state: AppState, paymentId: ID, date: string): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment || payment.method !== 'cheque') throw new AccountingError('Cheque not found.');
  if (chequeStatus(state, payment) !== 'pending') throw new AccountingError('This cheque is not pending clearance.');
  if (!isValidISODate(date)) throw new AccountingError('Invalid date.');
  checkLockDate(state, date);
  const journal = getJournal(state, payment.journalId);
  if (!journal.defaultAccountId) throw new AccountingError('The bank journal has no bank account.');
  const line = paymentLiquidityLine(state, payment)!;
  const inbound = payment.paymentType === 'inbound';
  const label = `Cheque ${payment.chequeNumber ?? ''} cleared`.trim();
  const transitLine: MoveLine = { id: newId(), accountId: line.accountId, partnerId: payment.partnerId, label, debit: inbound ? 0 : payment.amount, credit: inbound ? payment.amount : 0, kind: 'other' };
  const seq = nextSequence(state, journal.code, date);
  const move: Move = {
    id: newId(),
    moveType: 'entry',
    name: seq.name,
    state: 'posted',
    journalId: journal.id,
    partnerId: payment.partnerId,
    date,
    ref: label,
    narration: '',
    invoiceLines: [],
    lines: [
      { id: newId(), accountId: journal.defaultAccountId, partnerId: payment.partnerId, label, debit: inbound ? payment.amount : 0, credit: inbound ? 0 : payment.amount, kind: 'other' },
      transitLine,
    ],
    origin: 'cheque',
    originId: payment.id,
    createdAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
  };
  let next: AppState = { ...seq.state, moves: [...seq.state.moves, move], payments: replace(seq.state.payments, { ...payment, clearingMoveId: move.id }) };
  next = reconcileLines(next, [line.id, transitLine.id], date);
  return next;
}

/** Undo a manual cheque clearance. */
export function unclearCheque(state: AppState, paymentId: ID): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment?.clearingMoveId) return state;
  const move = getMove(state, payment.clearingMoveId);
  checkLockDate(state, move.date);
  const next = unreconcileMove(state, move.id);
  // The clearing entry stays in the books, cancelled.
  return { ...next, moves: replace(next.moves, { ...move, state: 'cancel' }), payments: replace(next.payments, { ...payment, clearingMoveId: undefined }) };
}

/** A returned/bounced cheque: the payment is cancelled and the invoices become due again. */
export function bounceCheque(state: AppState, paymentId: ID): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment || payment.method !== 'cheque') throw new AccountingError('Cheque not found.');
  if (chequeStatus(state, payment) === 'cleared') throw new AccountingError('Undo the clearance before marking the cheque as bounced.');
  const next = cancelPayment(state, paymentId);
  return { ...next, payments: next.payments.map((p) => (p.id === paymentId ? { ...p, bounced: true } : p)) };
}

export function cancelPayment(state: AppState, paymentId: ID): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new AccountingError('Payment not found.');
  if (payment.state === 'cancel') return state;
  checkLockDate(state, payment.date);
  const move = getMove(state, payment.moveId);
  const liquidityLineIds = new Set(move.lines.filter((l) => l.kind === 'other').map((l) => l.id));
  if (state.reconciles.some((r) => liquidityLineIds.has(r.debitLineId) || liquidityLineIds.has(r.creditLineId))) {
    throw new AccountingError('This payment is already cleared or matched with a bank statement line. Undo that first.');
  }
  const next = unreconcileMove(state, move.id);
  return {
    ...next,
    moves: replace(next.moves, { ...move, state: 'cancel' }),
    payments: replace(next.payments, { ...payment, state: 'cancel' }),
  };
}

/** Why a payment cannot be edited or deleted right now, if anything. */
function paymentBankMatchError(state: AppState, payment: Payment): string | undefined {
  const move = state.moves.find((m) => m.id === payment.moveId);
  if (!move) return undefined;
  const liquidity = new Set(move.lines.filter((l) => l.kind === 'other').map((l) => l.id));
  const clearing = payment.clearingMoveId;
  const matched = state.reconciles.some((r) => (liquidity.has(r.debitLineId) || liquidity.has(r.creditLineId)) && r.debitMoveId !== clearing && r.creditMoveId !== clearing);
  return matched ? 'This payment is matched with a bank statement line. Undo the bank reconciliation first.' : undefined;
}

/** The invoices and bills a payment is currently matched with. */
export function paymentMatchedMoveIds(state: AppState, payment: Payment): ID[] {
  const ids = state.reconciles
    .filter((r) => r.debitMoveId === payment.moveId || r.creditMoveId === payment.moveId)
    .map((r) => (r.debitMoveId === payment.moveId ? r.creditMoveId : r.debitMoveId));
  return [...new Set(ids)].filter((id) => id !== payment.clearingMoveId && state.moves.some((m) => m.id === id && isInvoice(m.moveType)));
}

/**
 * Change a posted payment in place: it keeps its voucher number and is matched again with the
 * invoices it settled (or the ones given in `input.moveIds`).
 */
export function editPayment(state: AppState, paymentId: ID, input: PaymentInput): { state: AppState; payment: Payment } {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new AccountingError('Payment not found.');
  if (payment.state !== 'posted') throw new AccountingError('Cancelled or bounced payments cannot be edited.');
  if (payment.clearingMoveId) throw new AccountingError('Undo the cheque clearance before editing this payment.');
  const blocked = paymentBankMatchError(state, payment);
  if (blocked) throw new AccountingError(blocked);
  if (input.paymentType !== payment.paymentType) throw new AccountingError('A receipt cannot be changed into a payment. Delete it and create a new one.');
  checkLockDate(state, payment.date);
  const previous = paymentMatchedMoveIds(state, payment).filter((id) => getMove(state, id).partnerId === input.partnerId);
  let next = unreconcileMove(state, payment.moveId);
  next = { ...next, moves: next.moves.filter((m) => m.id !== payment.moveId), payments: next.payments.filter((p) => p.id !== paymentId) };
  const moveIds = (input.moveIds ?? previous).filter((id) => next.moves.some((m) => m.id === id && m.state === 'posted'));
  const res = registerPayment(next, { ...input, moveIds: input.partnerType === 'other' ? undefined : moveIds }, { paymentId, moveId: payment.moveId, name: payment.name });
  // Keep the payment in its original position in the list.
  const order = state.payments.map((p) => (p.id === paymentId ? res.payment : p));
  return { state: { ...res.state, payments: order }, payment: res.payment };
}

/** Customer credits / vendor debits that can be applied to an invoice. */
export function outstandingForInvoice(state: AppState, move: Move): OpenItem[] {
  if (move.state !== 'posted' || !isInvoice(move.moveType)) return [];
  const term = move.lines.find((l) => l.kind === 'payment_term');
  if (!term) return [];
  const debitSide = term.debit > 0;
  return openItems(state, { accountId: term.accountId, partnerId: move.partnerId }).filter(
    (o) => o.move.id !== move.id && (debitSide ? o.residual < 0 : o.residual > 0),
  );
}

export function applyOutstanding(state: AppState, moveId: ID, lineId: ID): AppState {
  const move = getMove(state, moveId);
  const term = move.lines.filter((l) => l.kind === 'payment_term').map((l) => l.id);
  return reconcileLines(state, [...term, lineId]);
}
