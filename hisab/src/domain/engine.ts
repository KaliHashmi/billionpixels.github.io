import { computeInvoiceTotals } from './tax';
import {
  AccountingError,
  AppState,
  ID,
  InvoiceLine,
  Journal,
  Move,
  MoveLine,
  MoveType,
  Payment,
  PaymentState,
  PaymentTerm,
  Reconcile,
  StatementLine,
} from './types';
import { addDays, byId, endOfMonth, isValidISODate, isZero, newId, round, today } from './utils';

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

export const MOVE_TYPE_LABELS: Record<MoveType, string> = {
  entry: 'Journal Entry',
  out_invoice: 'Invoice',
  out_refund: 'Credit Note',
  in_invoice: 'Bill',
  in_refund: 'Refund',
};

export function isInvoice(t: MoveType): boolean {
  return t !== 'entry';
}

export function isSaleDoc(t: MoveType): boolean {
  return t === 'out_invoice' || t === 'out_refund';
}

export function isPurchaseDoc(t: MoveType): boolean {
  return t === 'in_invoice' || t === 'in_refund';
}

/** +1 when the receivable/payable line is a debit (invoice, vendor refund). */
function termSign(t: MoveType): 1 | -1 {
  return t === 'out_invoice' || t === 'in_refund' ? 1 : -1;
}

function replace<T extends { id: ID }>(items: T[], item: T): T[] {
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx === -1) return [...items, item];
  const copy = items.slice();
  copy[idx] = item;
  return copy;
}

export function getMove(state: AppState, id: ID): Move {
  const m = state.moves.find((x) => x.id === id);
  if (!m) throw new AccountingError('Journal entry not found.');
  return m;
}

export function getJournal(state: AppState, id: ID): Journal {
  const j = state.journals.find((x) => x.id === id);
  if (!j) throw new AccountingError('Journal not found.');
  return j;
}

export function defaultJournal(state: AppState, type: Journal['type']): Journal {
  const j = state.journals.find((x) => x.type === type && x.active);
  if (!j) throw new AccountingError(`No active ${type} journal configured.`);
  return j;
}

export function journalForMoveType(state: AppState, t: MoveType): Journal {
  if (isSaleDoc(t)) return defaultJournal(state, 'sale');
  if (isPurchaseDoc(t)) return defaultJournal(state, 'purchase');
  return defaultJournal(state, 'general');
}

export function checkLockDate(state: AppState, date: string, touchesTaxes = false): void {
  const { lockDate, taxLockDate } = state.settings;
  if (lockDate && date <= lockDate) {
    throw new AccountingError(`You cannot add or modify entries on or before the lock date (${lockDate}).`);
  }
  if (touchesTaxes && taxLockDate && date <= taxLockDate) {
    throw new AccountingError(`You cannot modify taxes on or before the tax lock date (${taxLockDate}).`);
  }
}

function sequencePrefix(state: AppState, move: Pick<Move, 'moveType' | 'journalId'>): string {
  const j = getJournal(state, move.journalId);
  return move.moveType === 'out_refund' || move.moveType === 'in_refund' ? `R${j.code}` : j.code;
}

export function nextSequence(state: AppState, prefix: string, date: string): { state: AppState; name: string } {
  const year = date.slice(0, 4);
  const key = `${prefix}/${year}`;
  const n = (state.sequences[key] ?? 0) + 1;
  return {
    state: { ...state, sequences: { ...state.sequences, [key]: n } },
    name: `${key}/${String(n).padStart(5, '0')}`,
  };
}

export function computeDueDate(invoiceDate: string, term?: PaymentTerm): string {
  if (!term) return invoiceDate;
  const d = addDays(invoiceDate, term.days);
  return term.endOfMonth ? endOfMonth(d) : d;
}

export function moveBalance(lines: MoveLine[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += l.debit;
    credit += l.credit;
  }
  return { debit, credit };
}

// ---------------------------------------------------------------------------
// Draft documents
// ---------------------------------------------------------------------------

export function newInvoiceLine(partial: Partial<InvoiceLine> = {}): InvoiceLine {
  return { id: newId(), label: '', quantity: 1, priceUnit: 0, discount: 0, taxIds: [], ...partial };
}

export function newMove(state: AppState, moveType: MoveType, partial: Partial<Move> = {}): Move {
  const date = partial.date ?? today();
  const termId = isInvoice(moveType) ? state.settings.defaultPaymentTermId : undefined;
  return {
    id: newId(),
    moveType,
    name: '/',
    state: 'draft',
    journalId: journalForMoveType(state, moveType).id,
    date,
    invoiceDate: isInvoice(moveType) ? date : undefined,
    paymentTermId: termId,
    ref: '',
    narration: '',
    invoiceLines: [],
    lines: [],
    origin: 'manual',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** Insert or update a draft document. */
export function saveDraft(state: AppState, move: Move): AppState {
  const existing = state.moves.find((m) => m.id === move.id);
  if (existing && existing.state !== 'draft') {
    throw new AccountingError('Only draft entries can be modified. Reset it to draft first.');
  }
  if (!isValidISODate(move.date)) throw new AccountingError('Invalid accounting date.');
  return { ...state, moves: replace(state.moves, { ...move, state: 'draft' }) };
}

export function deleteDraft(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  if (move.state === 'posted') throw new AccountingError('Posted entries cannot be deleted. Reset to draft or reverse it.');
  if (move.name !== '/' && move.state === 'draft') {
    throw new AccountingError('This entry already has a sequence number. Cancel it instead of deleting it.');
  }
  return { ...state, moves: state.moves.filter((m) => m.id !== moveId) };
}

/** Generate the journal items of an invoice/bill/refund from its invoice lines. */
export function buildInvoiceMoveLines(state: AppState, move: Move): MoveLine[] {
  const { decimals } = state.settings;
  const taxesById = byId(state.taxes);
  const productsById = byId(state.products);
  const journal = getJournal(state, move.journalId);
  const sale = isSaleDoc(move.moveType);
  const sign = termSign(move.moveType); // receivable debit => income credit
  const totals = computeInvoiceTotals(move.invoiceLines, taxesById, decimals);
  const lines: MoveLine[] = [];
  const dc = (amount: number, s: number) => {
    const v = round(amount * s, decimals);
    return { debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 };
  };

  move.invoiceLines.forEach((il, idx) => {
    const product = il.productId ? productsById.get(il.productId) : undefined;
    const accountId =
      il.accountId ??
      (sale ? product?.incomeAccountId : product?.expenseAccountId) ??
      journal.defaultAccountId;
    if (!accountId) throw new AccountingError(`Line "${il.label || idx + 1}" has no account.`);
    const lt = totals.lines[idx];
    if (isZero(lt.untaxed, decimals)) return;
    lines.push({
      id: newId(),
      accountId,
      partnerId: move.partnerId,
      label: il.label || product?.name || '',
      ...dc(lt.untaxed, -sign),
      kind: 'product',
      taxIds: il.taxIds.length ? il.taxIds : undefined,
      analyticAccountId: il.analyticAccountId,
    });
  });

  for (const t of totals.byTax) {
    if (isZero(t.amount, decimals)) continue;
    const tax = taxesById.get(t.taxId)!;
    lines.push({
      id: newId(),
      accountId: tax.accountId,
      partnerId: move.partnerId,
      label: tax.label || tax.name,
      ...dc(t.amount, -sign),
      kind: 'tax',
      taxId: tax.id,
    });
  }

  const accountId = sale ? state.settings.receivableAccountId : state.settings.payableAccountId;
  lines.push({
    id: newId(),
    accountId,
    partnerId: move.partnerId,
    label: move.ref || '',
    ...dc(totals.total, sign),
    kind: 'payment_term',
    dateMaturity: move.dueDate ?? move.invoiceDate ?? move.date,
  });
  return lines;
}

export function postMove(state: AppState, moveId: ID): AppState {
  let move = getMove(state, moveId);
  const { decimals } = state.settings;
  if (move.state !== 'draft') throw new AccountingError('Only draft entries can be posted.');
  if (!isValidISODate(move.date)) throw new AccountingError('Invalid accounting date.');

  if (isInvoice(move.moveType)) {
    if (!move.partnerId) throw new AccountingError(`A ${isSaleDoc(move.moveType) ? 'customer' : 'vendor'} is required.`);
    if (!move.invoiceLines.length) throw new AccountingError('Add at least one line before confirming.');
    const invoiceDate = move.invoiceDate && isValidISODate(move.invoiceDate) ? move.invoiceDate : move.date;
    const term = state.paymentTerms.find((p) => p.id === move.paymentTermId);
    const dueDate = move.dueDate && isValidISODate(move.dueDate) && !term ? move.dueDate : computeDueDate(invoiceDate, term);
    move = { ...move, invoiceDate, dueDate, date: isSaleDoc(move.moveType) ? invoiceDate : move.date };
    move = { ...move, lines: buildInvoiceMoveLines(state, move) };
  }

  const touchesTaxes = move.lines.some((l) => l.taxId || l.taxIds?.length);
  checkLockDate(state, move.date, touchesTaxes);

  if (!move.lines.length) throw new AccountingError('The entry has no journal items.');
  for (const l of move.lines) {
    if (!state.accounts.some((a) => a.id === l.accountId)) throw new AccountingError('A journal item uses an unknown account.');
    if (l.debit < 0 || l.credit < 0) throw new AccountingError('Debit and credit must be positive.');
  }
  const { debit, credit } = moveBalance(move.lines);
  if (!isZero(debit - credit, decimals)) {
    throw new AccountingError(`The entry is not balanced (debit ${round(debit, decimals)} ≠ credit ${round(credit, decimals)}).`);
  }
  if (isZero(debit, decimals)) throw new AccountingError('You cannot post an entry with a zero total.');

  let next = state;
  if (move.name === '/') {
    const seq = nextSequence(next, sequencePrefix(next, move), move.date);
    next = seq.state;
    move = { ...move, name: seq.name };
  }
  move = { ...move, state: 'posted', postedAt: new Date().toISOString() };
  return { ...next, moves: replace(next.moves, move) };
}

export function resetToDraft(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  if (move.state === 'draft') return state;
  if (move.origin === 'payment') throw new AccountingError('Cancel the payment instead of resetting its entry.');
  if (move.origin === 'statement') throw new AccountingError('Undo the bank reconciliation instead.');
  checkLockDate(state, move.date);
  const next = unreconcileMove(state, moveId);
  return { ...next, moves: replace(next.moves, { ...move, state: 'draft' }) };
}

export function cancelMove(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  if (move.state !== 'draft') throw new AccountingError('Reset the entry to draft before cancelling it.');
  return { ...state, moves: replace(state.moves, { ...move, state: 'cancel' }) };
}

export function duplicateMove(state: AppState, moveId: ID): { state: AppState; move: Move } {
  const src = getMove(state, moveId);
  const move: Move = {
    ...src,
    id: newId(),
    name: '/',
    state: 'draft',
    date: today(),
    invoiceDate: isInvoice(src.moveType) ? today() : undefined,
    dueDate: undefined,
    invoiceLines: src.invoiceLines.map((l) => ({ ...l, id: newId() })),
    lines: isInvoice(src.moveType) ? [] : src.lines.map((l) => ({ ...l, id: newId() })),
    reversedEntryId: undefined,
    origin: 'manual',
    originId: undefined,
    createdAt: new Date().toISOString(),
    postedAt: undefined,
  };
  return { state: { ...state, moves: [...state.moves, move] }, move };
}

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

function findLine(state: AppState, lineId: ID): { move: Move; line: MoveLine } {
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
  const items = lineIds.map((id) => findLine(state, id));
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
      const outstanding = new Set([state.settings.outstandingReceiptsAccountId, state.settings.outstandingPaymentsAccountId]);
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

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentInput {
  paymentType: 'inbound' | 'outbound';
  partnerType: 'customer' | 'supplier';
  partnerId?: ID;
  amount: number;
  date: string;
  journalId: ID;
  memo: string;
  /** Invoices/bills to match with the payment. */
  moveIds?: ID[];
}

export function liquidityAccountFor(state: AppState, journal: Journal, inbound: boolean): ID {
  if (journal.type === 'cash') {
    if (!journal.defaultAccountId) throw new AccountingError(`Journal ${journal.name} has no cash account.`);
    return journal.defaultAccountId;
  }
  return inbound ? state.settings.outstandingReceiptsAccountId : state.settings.outstandingPaymentsAccountId;
}

export function registerPayment(state: AppState, input: PaymentInput): { state: AppState; payment: Payment } {
  const { decimals } = state.settings;
  const amount = round(input.amount, decimals);
  if (!(amount > 0)) throw new AccountingError('The payment amount must be positive.');
  if (!isValidISODate(input.date)) throw new AccountingError('Invalid payment date.');
  checkLockDate(state, input.date);
  const journal = getJournal(state, input.journalId);
  if (journal.type !== 'bank' && journal.type !== 'cash') throw new AccountingError('Payments must use a bank or cash journal.');
  const inbound = input.paymentType === 'inbound';
  const liquidity = liquidityAccountFor(state, journal, inbound);
  const counterpart = input.partnerType === 'customer' ? state.settings.receivableAccountId : state.settings.payableAccountId;
  const label = input.memo || (inbound ? 'Customer payment' : 'Vendor payment');

  const paymentId = newId();
  const lines: MoveLine[] = [
    { id: newId(), accountId: liquidity, partnerId: input.partnerId, label, debit: inbound ? amount : 0, credit: inbound ? 0 : amount, kind: 'other' },
    { id: newId(), accountId: counterpart, partnerId: input.partnerId, label, debit: inbound ? 0 : amount, credit: inbound ? amount : 0, kind: 'payment_term', dateMaturity: input.date },
  ];
  const seq = nextSequence(state, `P${journal.code}`, input.date);
  let next = seq.state;
  const move: Move = {
    id: newId(),
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
    state: 'posted',
    moveId: move.id,
  };
  next = { ...next, moves: [...next.moves, move], payments: [...next.payments, payment] };

  if (input.moveIds?.length) {
    const targetIds: ID[] = [];
    for (const mid of input.moveIds) {
      const inv = getMove(next, mid);
      if (inv.state !== 'posted') throw new AccountingError(`${inv.name} is not posted.`);
      for (const l of inv.lines) if (l.kind === 'payment_term' && l.accountId === counterpart) targetIds.push(l.id);
    }
    next = reconcileLines(next, [...targetIds, lines[1].id], input.date);
  }
  return { state: next, payment };
}

export function cancelPayment(state: AppState, paymentId: ID): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new AccountingError('Payment not found.');
  if (payment.state === 'cancel') return state;
  checkLockDate(state, payment.date);
  const move = getMove(state, payment.moveId);
  const liquidityLineIds = new Set(move.lines.filter((l) => l.kind === 'other').map((l) => l.id));
  if (state.reconciles.some((r) => liquidityLineIds.has(r.debitLineId) || liquidityLineIds.has(r.creditLineId))) {
    throw new AccountingError('This payment is matched with a bank statement line. Undo that reconciliation first.');
  }
  const next = unreconcileMove(state, move.id);
  return {
    ...next,
    moves: replace(next.moves, { ...move, state: 'cancel' }),
    payments: replace(next.payments, { ...payment, state: 'cancel' }),
  };
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

// ---------------------------------------------------------------------------
// Reversal / credit notes
// ---------------------------------------------------------------------------

const REVERSE_TYPE: Record<MoveType, MoveType> = {
  entry: 'entry',
  out_invoice: 'out_refund',
  out_refund: 'out_invoice',
  in_invoice: 'in_refund',
  in_refund: 'in_invoice',
};

export interface ReverseOptions {
  date: string;
  reason: string;
  /** Post the reversal and fully reconcile it with the original. */
  post: boolean;
}

export function reverseMove(state: AppState, moveId: ID, opts: ReverseOptions): { state: AppState; move: Move } {
  const src = getMove(state, moveId);
  if (src.state !== 'posted') throw new AccountingError('Only posted entries can be reversed.');
  if (src.origin === 'payment') throw new AccountingError('Cancel the payment instead of reversing it.');
  const reason = opts.reason ? `Reversal of: ${src.name}, ${opts.reason}` : `Reversal of: ${src.name}`;
  let rev: Move = {
    ...src,
    id: newId(),
    moveType: REVERSE_TYPE[src.moveType],
    name: '/',
    state: 'draft',
    date: opts.date,
    invoiceDate: isInvoice(src.moveType) ? opts.date : undefined,
    dueDate: isInvoice(src.moveType) ? opts.date : undefined,
    paymentTermId: undefined,
    ref: reason,
    invoiceLines: src.invoiceLines.map((l) => ({ ...l, id: newId() })),
    lines: isInvoice(src.moveType)
      ? []
      : src.lines.map((l) => ({ ...l, id: newId(), debit: l.credit, credit: l.debit })),
    reversedEntryId: src.id,
    origin: 'manual',
    originId: undefined,
    createdAt: new Date().toISOString(),
    postedAt: undefined,
  };
  let next: AppState = { ...state, moves: [...state.moves, rev] };
  if (opts.post) {
    next = postMove(next, rev.id);
    rev = getMove(next, rev.id);
    // Reconcile receivable/payable (or any reconcilable) items between both entries.
    const reconcilable = new Set(next.accounts.filter((a) => a.reconcile).map((a) => a.id));
    const accountIds = new Set(src.lines.filter((l) => reconcilable.has(l.accountId)).map((l) => l.accountId));
    for (const accountId of accountIds) {
      const ids = [...src.lines, ...rev.lines].filter((l) => l.accountId === accountId).map((l) => l.id);
      next = reconcileLines(next, ids, opts.date);
    }
  }
  return { state: next, move: rev };
}

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
    // Money in (remaining > 0) settles debit items (open > 0) and vice versa.
    if (isZero(remaining, decimals) || Math.sign(open) !== Math.sign(remaining)) continue;
    const used = Math.sign(open) * Math.min(Math.abs(open), Math.abs(remaining));
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
    const tax = writeOff.taxId ? state.taxes.find((t) => t.id === writeOff.taxId) : undefined;
    let base = remaining;
    if (tax && tax.amountType === 'percent' && tax.amount) {
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
  const accounts = new Set([s.receivableAccountId, s.payableAccountId, s.outstandingReceiptsAccountId, s.outstandingPaymentsAccountId]);
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
