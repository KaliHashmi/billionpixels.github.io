// Shared helpers: labels, lookups, lock dates, sequence numbers.
import {
  AccountingError,
  AppState,
  ID,
  Journal,
  Move,
  MoveLine,
  MoveType,
  PaymentTerm,
} from '../types';
import { addDays, endOfMonth } from '../utils';

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
/** @internal shared by the engine modules */
export function termSign(t: MoveType): 1 | -1 {
  return t === 'out_invoice' || t === 'in_refund' ? 1 : -1;
}

/** @internal shared by the engine modules */
export function replace<T extends { id: ID }>(items: T[], item: T): T[] {
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

/** @internal shared by the engine modules */
export function sequencePrefix(state: AppState, move: Pick<Move, 'moveType' | 'journalId'>): string {
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
