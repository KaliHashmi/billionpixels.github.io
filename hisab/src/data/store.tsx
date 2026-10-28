import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildReconcileIndex, ReconcileIndex } from '../domain/engine';
import { AccountingError, Account, AnalyticAccount, AppState, ID, Journal, Partner, PaymentTerm, Product, Tax } from '../domain/types';
import { byId, formatAmount } from '../domain/utils';
import { notify } from '../ui/dialog';
import { diffStates, isEmptyChange } from './persistence';
import { storage } from './storage';

interface StoreValue {
  ready: boolean;
  state: AppState | null;
  /**
   * Apply a domain operation. Errors are shown to the user and `false` is returned.
   * The new state is persisted in the background (writes are serialized).
   */
  run: (op: (s: AppState) => AppState) => boolean;
  /** Like run, but returns a value computed by the operation. */
  runWith: <T>(op: (s: AppState) => { state: AppState; value: T }) => T | undefined;
  replace: (state: AppState | null) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [ready, setReady] = useState(false);
  const ref = useRef<AppState | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    storage
      .load()
      .then((s) => {
        ref.current = s;
        setState(s);
      })
      .catch((e) => notify('Could not open the database', String(e)))
      .finally(() => setReady(true));
  }, []);

  const commit = useCallback((next: AppState) => {
    const prev = ref.current;
    ref.current = next;
    setState(next);
    const change = diffStates(prev, next);
    if (isEmptyChange(change)) return;
    queue.current = queue.current
      .then(() => storage.apply(change, next))
      .catch((e) => notify('Saving failed', String(e)));
  }, []);

  const runWith = useCallback(
    <T,>(op: (s: AppState) => { state: AppState; value: T }): T | undefined => {
      const current = ref.current;
      if (!current) return undefined;
      try {
        const res = op(current);
        commit(res.state);
        return res.value;
      } catch (e) {
        if (e instanceof AccountingError) notify('Validation Error', e.message);
        else notify('Unexpected error', e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [commit],
  );

  const run = useCallback(
    (op: (s: AppState) => AppState) => runWith((s) => ({ state: op(s), value: true })) ?? false,
    [runWith],
  );

  const replace = useCallback(async (next: AppState | null) => {
    await queue.current;
    ref.current = next;
    setState(next);
    queue.current = next ? storage.replaceAll(next) : storage.clear();
    await queue.current;
  }, []);

  const value = useMemo(() => ({ ready, state, run, runWith, replace }), [ready, state, run, runWith, replace]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** The current books. Only use below the onboarding gate. */
export function useBooks(): AppState {
  const { state } = useStore();
  if (!state) throw new Error('No company set up');
  return state;
}

export interface Lookups {
  accounts: Map<ID, Account>;
  journals: Map<ID, Journal>;
  partners: Map<ID, Partner>;
  products: Map<ID, Product>;
  taxes: Map<ID, Tax>;
  terms: Map<ID, PaymentTerm>;
  analytic: Map<ID, AnalyticAccount>;
  reconcileIndex: ReconcileIndex;
}

export function useLookups(): Lookups {
  const s = useBooks();
  const accounts = useMemo(() => byId(s.accounts), [s.accounts]);
  const journals = useMemo(() => byId(s.journals), [s.journals]);
  const partners = useMemo(() => byId(s.partners), [s.partners]);
  const products = useMemo(() => byId(s.products), [s.products]);
  const taxes = useMemo(() => byId(s.taxes), [s.taxes]);
  const terms = useMemo(() => byId(s.paymentTerms), [s.paymentTerms]);
  const analytic = useMemo(() => byId(s.analyticAccounts), [s.analyticAccounts]);
  const reconcileIndex = useMemo(() => buildReconcileIndex(s.reconciles), [s.reconciles]);
  return { accounts, journals, partners, products, taxes, terms, analytic, reconcileIndex };
}

/** Currency formatting bound to company settings. */
export function useMoney() {
  const { settings } = useBooks();
  return useMemo(
    () =>
      (v: number, withSymbol = true) =>
        formatAmount(v, settings.decimals, withSymbol ? settings.currencySymbol : ''),
    [settings],
  );
}
