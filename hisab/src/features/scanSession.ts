// The documents the user scanned or uploaded in this session, read one after another in the background.
// Kept in memory: each one becomes a draft bill or credit note as soon as it is read (saved in the books);
// a cash expense is saved when the user taps Save on the pre-filled form.
import { useSyncExternalStore } from 'react';
import type { DocumentKind, ReceiptReading } from '../domain/receiptReader';
import { ID } from '../domain/types';
import { newId } from '../domain/utils';

export interface ScanItem {
  id: string;
  /** Position in the batch, for naming ("Document 2"). */
  n: number;
  /** The file, dropped once it has been read to free memory. */
  source: { dataUri: string; mimeType: string } | null;
  status: 'queued' | 'reading' | 'ready' | 'failed';
  step?: 'reading' | 'recognising';
  text?: string;
  /** First page as a JPEG, kept as the receipt photo. */
  preview?: string;
  reading?: ReceiptReading;
  kind?: DocumentKind;
  /** Suggested account (from this vendor's last booking, or keywords). */
  accountId?: ID;
  /** The draft bill / credit note, or the saved payment voucher. */
  targetId?: ID;
  error?: string;
}

let items: ScanItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const scanSession = {
  add(sources: { dataUri: string; mimeType: string }[]) {
    const start = items.length;
    items = [...items, ...sources.map((source, i) => ({ id: newId(), n: start + i + 1, source, status: 'queued' as const }))];
    emit();
  },
  update(id: string, patch: Partial<ScanItem>) {
    items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    emit();
  },
  get: (id: string | undefined) => items.find((i) => i.id === id),
  clear() {
    items = [];
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useScanItems(): ScanItem[] {
  return useSyncExternalStore(scanSession.subscribe, () => items, () => items);
}

export function useScanItem(id: string | undefined): ScanItem | undefined {
  const all = useScanItems();
  return all.find((i) => i.id === id);
}
