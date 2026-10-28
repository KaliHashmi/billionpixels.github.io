import { AppState, CollectionName } from '../domain/types';

export const COLLECTIONS: CollectionName[] = [
  'accounts',
  'journals',
  'taxes',
  'paymentTerms',
  'partners',
  'products',
  'analyticAccounts',
  'moves',
  'reconciles',
  'payments',
  'statementLines',
  'assets',
];

export const SCHEMA_VERSION = 1;

export interface Change {
  upserts: { collection: CollectionName; id: string; data: unknown }[];
  deletes: { collection: CollectionName; id: string }[];
  meta: { key: 'settings' | 'sequences'; value: unknown }[];
}

/** Compute the record-level changes between two immutable states. */
export function diffStates(prev: AppState | null, next: AppState): Change {
  const change: Change = { upserts: [], deletes: [], meta: [] };
  for (const c of COLLECTIONS) {
    const before = prev?.[c] as { id: string }[] | undefined;
    const after = next[c] as { id: string }[];
    if (before === after) continue;
    const prevById = new Map((before ?? []).map((r) => [r.id, r]));
    for (const r of after) {
      if (prevById.get(r.id) !== r) change.upserts.push({ collection: c, id: r.id, data: r });
      prevById.delete(r.id);
    }
    for (const id of prevById.keys()) change.deletes.push({ collection: c, id });
  }
  if (prev?.settings !== next.settings) change.meta.push({ key: 'settings', value: next.settings });
  if (prev?.sequences !== next.sequences) change.meta.push({ key: 'sequences', value: next.sequences });
  return change;
}

export function isEmptyChange(c: Change): boolean {
  return !c.upserts.length && !c.deletes.length && !c.meta.length;
}

/** Bring older saved data up to the current shape. */
export function migrate(state: AppState): AppState {
  const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  return { ...empty, ...state, sequences: state.sequences ?? {} } as AppState;
}

export interface Storage {
  load(): Promise<AppState | null>;
  /** Persist `change`; `next` is the full resulting state. */
  apply(change: Change, next: AppState): Promise<void>;
  replaceAll(state: AppState): Promise<void>;
  clear(): Promise<void>;
}
