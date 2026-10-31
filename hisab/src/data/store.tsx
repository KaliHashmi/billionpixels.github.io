import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { ENV } from '../config/env';
import { canDeleteDocuments, canEdit, canEditDocuments, login as checkLogin, restoreSession, SavedSession, saveSession } from '../domain/auth';
import { buildReconcileIndex, ReconcileIndex } from '../domain/engine';
import { AccountingError, Account, AnalyticAccount, AppState, ID, Journal, Partner, PaymentTerm, Product, Tax, User } from '../domain/types';
import { byId, formatAmount } from '../domain/utils';
import { useT } from '../i18n';
import { notify } from '../ui/dialog';
import { diffStates, isEmptyChange } from './persistence';
import { storage } from './storage';

/** Lock the app after this long in the background (unless the user chose to stay signed in). */
const AUTO_LOCK_MS = 5 * 60 * 1000;
/** The remembered sign-in of this variant's books. */
const SESSION_PREF = `session:${ENV.databaseName}`;
/** The last choice of the "Keep me signed in" switch. */
export const KEEP_SIGNED_IN_PREF = 'keepSignedIn';

function readSession(raw: string | null): SavedSession | null {
  try {
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

/** Secure random bytes for password salts. */
export const randomBytes = (n: number) => Crypto.getRandomBytes(n);

interface RunOptions {
  /** Allowed for read-only users too (login bookkeeping, own password). */
  allowReadOnly?: boolean;
  /** Changing or removing an issued document: checked against canEditDocuments / canDeleteDocuments. */
  requires?: 'editDocuments' | 'deleteDocuments';
}

interface StoreValue {
  ready: boolean;
  state: AppState | null;
  /** Signed-in user (always set below the login gate). */
  user: User | null;
  /** `keep`: stay signed in on this device ("Keep me signed in"). */
  login: (username: string, password: string, keep?: boolean) => string | undefined;
  /** Sign in a user already verified another way (new company, biometrics). */
  startSession: (userId: string, keep?: boolean) => void;
  logout: () => void;
  /**
   * Apply a domain operation. Errors are shown to the user and `false` is returned.
   * The new state is persisted in the background (writes are serialized).
   */
  run: (op: (s: AppState) => AppState, opts?: RunOptions) => boolean;
  /** Like run, but returns a value computed by the operation. */
  runWith: <T>(op: (s: AppState) => { state: AppState; value: T }, opts?: RunOptions) => T | undefined;
  replace: (state: AppState | null) => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [state, setState] = useState<AppState | null>(null);
  const [ready, setReady] = useState(false);
  const ref = useRef<AppState | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [userId, setUserId] = useState<string | null>(null);
  const userRef = useRef<string | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const kept = useRef(false);
  const user = (userId && state?.users.find((u) => u.id === userId && u.active)) || null;

  const setSession = useCallback((id: string | null, keep = false) => {
    userRef.current = id;
    setUserId(id);
    kept.current = !!id && keep;
    const u = id ? ref.current?.users.find((x) => x.id === id) : undefined;
    storage.setPref(SESSION_PREF, kept.current && u ? JSON.stringify(saveSession(u)) : '').catch(() => undefined);
  }, []);

  // A password change while signed in (own change or forced change) keeps the remembered sign-in.
  const salt = user?.salt;
  useEffect(() => {
    if (kept.current && salt && userRef.current) setSession(userRef.current, true);
  }, [salt, setSession]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (status) => {
      if (status === 'background' || status === 'inactive') {
        backgroundAt.current ??= Date.now();
      } else if (status === 'active') {
        if (!kept.current && backgroundAt.current && Date.now() - backgroundAt.current > AUTO_LOCK_MS) setSession(null);
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, [setSession]);

  useEffect(() => {
    storage
      .load()
      .then(async (s) => {
        ref.current = s;
        setState(s);
        // Pick up "Keep me signed in" from an earlier visit (and extend it).
        const saved = s ? restoreSession(s, readSession(await storage.getPref(SESSION_PREF).catch(() => null))) : undefined;
        if (saved) setSession(saved.id, true);
      })
      .catch((e) => notify('Could not open the database', String(e)))
      .finally(() => setReady(true));
  }, [setSession]);

  const commit = useCallback((next: AppState) => {
    const prev = ref.current;
    ref.current = next;
    setState(next);
    const change = diffStates(prev, next);
    if (isEmptyChange(change)) return;
    queue.current = queue.current
      .then(() => storage.apply(change, next))
      .catch((e) => notify(t('Saving failed'), String(e)));
  }, [t]);

  const runWith = useCallback(
    <T,>(op: (s: AppState) => { state: AppState; value: T }, opts?: RunOptions): T | undefined => {
      const current = ref.current;
      if (!current) return undefined;
      const role = current.users.find((u) => u.id === userRef.current)?.role;
      if (!opts?.allowReadOnly && current.users.length > 0 && !canEdit(role)) {
        notify(t('Read-only access'), t('Your account can view the books but not change them.'));
        return undefined;
      }
      if (current.users.length > 0 && opts?.requires === 'editDocuments' && !canEditDocuments(role)) {
        notify(t('Not allowed'), t('Only an administrator can edit issued documents.'));
        return undefined;
      }
      if (current.users.length > 0 && opts?.requires === 'deleteDocuments' && !canDeleteDocuments(role)) {
        notify(t('Not allowed'), t('Your account cannot delete documents.'));
        return undefined;
      }
      try {
        const res = op(current);
        commit(res.state);
        return res.value;
      } catch (e) {
        if (e instanceof AccountingError) notify(t('Validation Error'), t(e.message));
        else notify(t('Unexpected error'), e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [commit, t],
  );

  const run = useCallback(
    (op: (s: AppState) => AppState, opts?: RunOptions) => runWith((s) => ({ state: op(s), value: true }), opts) ?? false,
    [runWith],
  );

  const login = useCallback(
    (username: string, password: string, keep = false): string | undefined => {
      const current = ref.current;
      if (!current) return 'No company';
      const res = checkLogin(current, username, password);
      commit(res.state);
      if (!res.ok) return res.error;
      setSession(res.user.id, keep);
      storage.setPref('lastUser', res.user.username).catch(() => undefined);
      return undefined;
    },
    [commit, setSession],
  );

  const logout = useCallback(() => setSession(null), [setSession]);

  const replace = useCallback(async (next: AppState | null) => {
    await queue.current;
    // A different set of books needs its own sign-in.
    if (!next || !next.users.some((u) => u.id === userRef.current)) setSession(null);
    ref.current = next;
    setState(next);
    queue.current = next ? storage.replaceAll(next) : storage.clear();
    await queue.current;
  }, [setSession]);

  const value = useMemo(
    () => ({ ready, state, user, login, startSession: setSession, logout, run, runWith, replace }),
    [ready, state, user, login, setSession, logout, run, runWith, replace],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** What the signed-in user may do. Everything is allowed before the first user exists. */
export function usePermissions() {
  const { state, user } = useStore();
  const open = !state || state.users.length === 0;
  return {
    create: open || canEdit(user?.role),
    editDocuments: open || canEditDocuments(user?.role),
    deleteDocuments: open || canDeleteDocuments(user?.role),
  };
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
