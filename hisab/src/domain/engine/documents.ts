// Draft, post, reset, delete, duplicate and reverse invoices, bills and entries.
import { computeInvoiceTotals } from '../tax';
import {
  AccountingError,
  AppState,
  ID,
  InvoiceLine,
  Move,
  MoveLine,
  MoveType,
} from '../types';
import { byId, isValidISODate, isZero, newId, round, today } from '../utils';
import { checkLockDate, computeDueDate, getJournal, getMove, isInvoice, isSaleDoc, journalForMoveType, moveBalance, nextSequence, replace, sequencePrefix, termSign } from './core';
import { buildReconcileIndex, lineResidual, reconcileLines, unreconcileMove } from './reconcile';

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
  return { ...state, moves: state.moves.filter((m) => m.id !== moveId), attachments: (state.attachments ?? []).filter((a) => a.ownerId !== moveId) };
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
    if (move.supplyDate && !isValidISODate(move.supplyDate)) throw new AccountingError('The date of supply must use the YYYY-MM-DD format.');
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
  if (isIssuedTaxDocument(move)) throw new AccountingError('An issued tax invoice or credit note cannot be changed. Correct it with a credit note.');
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

const ELSEWHERE: Partial<Record<Move['origin'], string>> = {
  payment: 'Cancel the payment voucher instead.',
  statement: 'Undo the bank reconciliation instead.',
  cheque: 'Undo the cheque clearance from its payment instead.',
  payroll: 'Cancel the payroll instead.',
  asset: 'Manage this entry from its asset.',
  cash_closing: 'Reopen the cash day instead.',
};

/**
 * Oman VAT law: issued tax invoices and credit notes are kept (10 years) and corrected only by a
 * credit note. Any document that has been given a number is part of the books and is never erased.
 */
export const RETENTION_MESSAGE = 'Issued documents are kept as part of the books (10 years under Oman law). Cancel it or issue a credit note instead.';

/** Sales invoice or credit note that has been issued (numbered): changed only through a credit note. */
export function isIssuedTaxDocument(move: Move): boolean {
  return (move.moveType === 'out_invoice' || move.moveType === 'out_refund') && move.name !== '/';
}

/** Only a document that was never numbered (a draft never confirmed) can be erased. */
export function deleteMove(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  const elsewhere = ELSEWHERE[move.origin];
  if (elsewhere) throw new AccountingError(elsewhere);
  if (move.name !== '/' || move.state !== 'draft') throw new AccountingError(RETENTION_MESSAGE);
  return { ...state, moves: state.moves.filter((m) => m.id !== moveId), attachments: (state.attachments ?? []).filter((a) => a.ownerId !== moveId) };
}

/**
 * Cancel an issued bill, vendor credit note, journal entry or VAT closing: it stays in the books,
 * marked cancelled, and no longer affects any balance. Sales tax documents need a credit note instead.
 */
export function cancelIssuedMove(state: AppState, moveId: ID): AppState {
  const move = getMove(state, moveId);
  const elsewhere = ELSEWHERE[move.origin];
  if (elsewhere) throw new AccountingError(elsewhere);
  if (move.state === 'cancel') return state;
  if (isIssuedTaxDocument(move)) throw new AccountingError('An issued tax invoice or credit note is cancelled with a credit note.');
  if (state.moves.some((m) => m.reversedEntryId === moveId && m.state !== 'cancel')) {
    throw new AccountingError('A credit note or reversal refers to this document. Cancel it first.');
  }
  if (move.state === 'posted') checkLockDate(state, move.date, move.origin !== 'tax_closing' && move.lines.some((l) => l.taxId || l.taxIds?.length));
  let next = unreconcileMove(state, moveId);
  next = { ...next, moves: replace(next.moves, { ...move, state: 'cancel' }) };
  if (move.origin === 'tax_closing' && move.state === 'posted' && state.settings.taxLockDate === move.date) {
    // The VAT lock came from this closing: fall back to the latest remaining one.
    const latest = next.moves
      .filter((m) => m.origin === 'tax_closing' && m.state === 'posted')
      .reduce<string | undefined>((d, m) => (!d || m.date > d ? m.date : d), undefined);
    next = { ...next, settings: { ...next.settings, taxLockDate: latest } };
  }
  return next;
}

/**
 * Correct an issued sales invoice the lawful way: a full credit note (with the reason) cancels it,
 * and a new draft copy is prepared for the corrected invoice, which gets its own number.
 */
export function correctInvoice(state: AppState, moveId: ID, opts: { date: string; reason: string }): { state: AppState; creditNote: Move; draft: Move } {
  const move = getMove(state, moveId);
  if (move.moveType !== 'out_invoice' || move.state !== 'posted') throw new AccountingError('Only an issued sales invoice can be corrected this way.');
  const credit = reverseMove(state, moveId, { ...opts, post: true });
  const copy = duplicateMove(credit.state, moveId);
  return { state: copy.state, creditNote: credit.move, draft: copy.move };
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
    reason: undefined,
    rematchLineIds: undefined,
    origin: 'manual',
    originId: undefined,
    createdAt: new Date().toISOString(),
    postedAt: undefined,
  };
  return { state: { ...state, moves: [...state.moves, move] }, move };
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
  // A tax credit note must state why it was issued.
  if (isSaleDoc(src.moveType) && !opts.reason.trim()) throw new AccountingError('Enter the reason for the credit note.');
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
    reason: opts.reason.trim() || undefined,
    supplyDate: undefined,
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
