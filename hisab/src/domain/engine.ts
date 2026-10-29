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
  PaymentMethod,
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
  in_invoice: 'Purchase Invoice',
  in_refund: 'Vendor Credit Note',
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
    if (tax.reverseCharge) {
      // Self-assessed output VAT offsets the input VAT above; the vendor is not paid any tax.
      lines.push({
        id: newId(),
        accountId: tax.reverseAccountId ?? state.settings.taxSettlementAccountId,
        partnerId: move.partnerId,
        label: `${tax.label || tax.name} (reverse charge)`,
        ...dc(t.amount, sign),
        kind: 'tax',
        taxId: tax.id,
        reverseCharge: true,
      });
    }
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
  const rematch = move.rematchLineIds;
  move = { ...move, state: 'posted', postedAt: new Date().toISOString(), rematchLineIds: undefined };
  next = { ...next, moves: replace(next.moves, move) };
  return rematch?.length ? rematchPayments(next, move, rematch) : next;
}

/** After an edited invoice is posted again, match the payments and credits it had before (as far as they still fit). */
function rematchPayments(state: AppState, move: Move, lineIds: ID[]): AppState {
  const { decimals } = state.settings;
  const idx = buildReconcileIndex(state.reconciles);
  for (const term of move.lines.filter((l) => l.kind === 'payment_term')) {
    const others = lineIds.filter((id) => {
      const found = state.moves.find((m) => m.state === 'posted' && m.id !== move.id && m.lines.some((l) => l.id === id));
      const line = found?.lines.find((l) => l.id === id);
      return !!line && line.accountId === term.accountId && line.partnerId === term.partnerId && !isZero(lineResidual(line, idx, decimals), decimals);
    });
    if (others.length) state = reconcileLines(state, [term.id, ...others], move.date);
  }
  return state;
}

export function resetToDraft(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  if (move.state === 'draft') return state;
  if (move.origin === 'payment') throw new AccountingError('Cancel the payment instead of resetting its entry.');
  if (move.origin === 'statement') throw new AccountingError('Undo the bank reconciliation instead.');
  checkLockDate(state, move.date);
  // Remember what was matched with the invoice so re-posting it keeps it paid.
  const rematchLineIds = isInvoice(move.moveType)
    ? state.reconciles
        .filter((r) => r.debitMoveId === moveId || r.creditMoveId === moveId)
        .map((r) => (r.debitMoveId === moveId ? r.creditLineId : r.debitLineId))
        .filter((id, i, all) => all.indexOf(id) === i)
    : undefined;
  const next = unreconcileMove(state, moveId);
  return { ...next, moves: replace(next.moves, { ...move, state: 'draft', rematchLineIds: rematchLineIds?.length ? rematchLineIds : undefined }) };
}

const DELETE_ELSEWHERE: Partial<Record<Move['origin'], string>> = {
  payment: 'Delete the payment voucher instead.',
  statement: 'Undo the bank reconciliation instead.',
  cheque: 'Undo the cheque clearance from its payment instead.',
  payroll: 'Delete the payroll instead.',
  asset: 'Manage this entry from its asset.',
  cash_closing: 'Reopen the cash day instead.',
};

/**
 * Permanently remove an invoice, bill, credit note, journal entry or VAT closing, posted or not.
 * Its matches are undone, so payments on it become unallocated credits again.
 */
export function deleteMove(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  const elsewhere = DELETE_ELSEWHERE[move.origin];
  if (elsewhere) throw new AccountingError(elsewhere);
  const credit = state.moves.find((m) => m.reversedEntryId === moveId && m.state !== 'cancel');
  if (credit) throw new AccountingError('A credit note or reversal refers to this document. Delete it first.');
  if (move.state === 'posted') checkLockDate(state, move.date, move.origin !== 'tax_closing' && move.lines.some((l) => l.taxId || l.taxIds?.length));
  let next = unreconcileMove(state, moveId);
  next = { ...next, moves: next.moves.filter((m) => m.id !== moveId) };
  if (move.origin === 'tax_closing' && move.state === 'posted' && state.settings.taxLockDate === move.date) {
    // The VAT lock came from this closing: fall back to the latest remaining one.
    const latest = next.moves
      .filter((m) => m.origin === 'tax_closing' && m.state === 'posted')
      .reduce<string | undefined>((d, m) => (!d || m.date > d ? m.date : d), undefined);
    next = { ...next, settings: { ...next.settings, taxLockDate: latest } };
  }
  return next;
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
  return { ...next, moves: next.moves.filter((m) => m.id !== move.id), payments: replace(next.payments, { ...payment, clearingMoveId: undefined }) };
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

/** Permanently remove a receipt or payment voucher with its journal entries; the invoices it paid become due again. */
export function deletePayment(state: AppState, paymentId: ID): AppState {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new AccountingError('Payment not found.');
  const blocked = paymentBankMatchError(state, payment);
  if (blocked) throw new AccountingError(blocked);
  if (payment.state === 'posted') checkLockDate(state, payment.date);
  let next = payment.clearingMoveId ? unclearCheque(state, paymentId) : state;
  next = unreconcileMove(next, payment.moveId);
  return {
    ...next,
    moves: next.moves.filter((m) => m.id !== payment.moveId),
    payments: next.payments.filter((p) => p.id !== paymentId),
  };
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
