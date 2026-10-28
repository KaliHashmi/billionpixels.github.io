import { InvoiceStatus, isInvoice } from '../domain/engine';
import { Move } from '../domain/types';

const PAYMENT_LABELS = {
  not_paid: 'Not Paid',
  partial: 'Partially Paid',
  in_payment: 'In Payment',
  paid: 'Paid',
  reversed: 'Reversed',
};

export function moveBadge(move: Move, st?: InvoiceStatus): { label: string; tone: string } {
  if (move.state === 'draft') return { label: 'Draft', tone: 'draft' };
  if (move.state === 'cancel') return { label: 'Cancelled', tone: 'cancel' };
  if (!isInvoice(move.moveType) || !st) return { label: 'Posted', tone: 'posted' };
  if (st.overdue) return { label: 'Overdue', tone: 'overdue' };
  return { label: PAYMENT_LABELS[st.paymentState], tone: st.paymentState };
}
