// General and partner ledgers, aged balances, journal audit and analytic report.
import { buildReconcileIndex, lineResidual } from '../engine';
import { isPnlType } from '../template';
import { AppState, ID, Move, MoveLine, Partner } from '../types';
import { byId, daysBetween, isZero, round } from '../utils';
import { Item, postedItems, trialBalance } from './base';

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

export interface LedgerLine extends Item {
  balance: number;
}

export interface LedgerGroup {
  key: ID;
  title: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  lines: LedgerLine[];
}

export function generalLedger(state: AppState, from: string, to: string, accountId?: ID): LedgerGroup[] {
  const d = state.settings.decimals;
  const tb = trialBalance(state, from, to);
  const items = postedItems(state, { from, to });
  const groups: LedgerGroup[] = [];
  for (const row of tb.rows) {
    if (accountId && row.account.id !== accountId) continue;
    let bal = row.initial;
    const lines = items
      .filter((it) => it.account.id === row.account.id)
      .map((it) => {
        bal = round(bal + it.line.debit - it.line.credit, d);
        return { ...it, balance: bal };
      });
    groups.push({
      key: row.account.id,
      title: `${row.account.code} ${row.account.name}`,
      opening: row.initial,
      debit: row.debit,
      credit: row.credit,
      closing: row.end,
      lines,
    });
  }
  return groups;
}

export function partnerLedger(state: AppState, from: string, to: string, kind: 'customer' | 'supplier' | 'all'): LedgerGroup[] {
  const d = state.settings.decimals;
  const s = state.settings;
  const accounts = new Set(kind === 'customer' ? [s.receivableAccountId] : kind === 'supplier' ? [s.payableAccountId] : [s.receivableAccountId, s.payableAccountId]);
  const partners = byId(state.partners);
  const all = postedItems(state, { to }).filter((it) => accounts.has(it.account.id) && it.line.partnerId);
  const byPartner = new Map<ID, Item[]>();
  for (const it of all) {
    const arr = byPartner.get(it.line.partnerId!) ?? [];
    arr.push(it);
    byPartner.set(it.line.partnerId!, arr);
  }
  const groups: LedgerGroup[] = [];
  for (const [pid, its] of byPartner) {
    const opening = round(its.filter((i) => i.move.date < from).reduce((x, i) => x + i.line.debit - i.line.credit, 0), d);
    let bal = opening;
    let debit = 0;
    let credit = 0;
    const lines = its
      .filter((i) => i.move.date >= from)
      .map((i) => {
        debit += i.line.debit;
        credit += i.line.credit;
        bal = round(bal + i.line.debit - i.line.credit, d);
        return { ...i, balance: bal };
      });
    if (!lines.length && isZero(opening, d)) continue;
    groups.push({
      key: pid,
      title: partners.get(pid)?.name ?? 'Unknown partner',
      opening,
      debit: round(debit, d),
      credit: round(credit, d),
      closing: bal,
      lines,
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Aged receivable / payable
// ---------------------------------------------------------------------------

export const AGED_BUCKETS = ['Not due', '1-30', '31-60', '61-90', '91-120', 'Older'] as const;

export interface AgedRow {
  partner?: Partner;
  partnerId?: ID;
  buckets: number[];
  total: number;
  items: { move: Move; line: MoveLine; residual: number; days: number }[];
}

export function agedBalance(state: AppState, kind: 'receivable' | 'payable', asOf: string): { rows: AgedRow[]; totals: number[]; total: number } {
  const d = state.settings.decimals;
  const accountId = kind === 'receivable' ? state.settings.receivableAccountId : state.settings.payableAccountId;
  const sign = kind === 'receivable' ? 1 : -1;
  const idx = buildReconcileIndex(state.reconciles.filter((r) => r.date <= asOf));
  const partners = byId(state.partners);
  const rows = new Map<string, AgedRow>();
  for (const move of state.moves) {
    if (move.state !== 'posted' || move.date > asOf) continue;
    for (const line of move.lines) {
      if (line.accountId !== accountId) continue;
      const residual = round(sign * lineResidual(line, idx, d), d);
      if (isZero(residual, d)) continue;
      const due = line.dateMaturity ?? move.date;
      const days = daysBetween(due, asOf);
      const bucket = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : days <= 120 ? 4 : 5;
      const key = line.partnerId ?? '';
      const row = rows.get(key) ?? { partner: partners.get(key), partnerId: line.partnerId, buckets: [0, 0, 0, 0, 0, 0], total: 0, items: [] };
      row.buckets[bucket] = round(row.buckets[bucket] + residual, d);
      row.total = round(row.total + residual, d);
      row.items.push({ move, line, residual, days });
      rows.set(key, row);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const totals = [0, 1, 2, 3, 4, 5].map((i) => round(list.reduce((s, r) => s + r.buckets[i], 0), d));
  return { rows: list, totals, total: round(totals.reduce((s, v) => s + v, 0), d) };
}


export interface JournalAuditGroup {
  journalId: ID;
  title: string;
  moves: Move[];
  debit: number;
  credit: number;
}

export function journalAudit(state: AppState, from: string, to: string): JournalAuditGroup[] {
  const d = state.settings.decimals;
  return state.journals
    .map((j) => {
      const moves = state.moves
        .filter((m) => m.journalId === j.id && m.state === 'posted' && m.date >= from && m.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
      const debit = round(moves.reduce((s, m) => s + m.lines.reduce((x, l) => x + l.debit, 0), 0), d);
      const credit = round(moves.reduce((s, m) => s + m.lines.reduce((x, l) => x + l.credit, 0), 0), d);
      return { journalId: j.id, title: `${j.name} (${j.code})`, moves, debit, credit };
    })
    .filter((g) => g.moves.length);
}

export interface AnalyticRow {
  id: ID;
  name: string;
  income: number;
  expense: number;
  balance: number;
}

export function analyticReport(state: AppState, from: string, to: string): AnalyticRow[] {
  const d = state.settings.decimals;
  const rows = new Map<ID, AnalyticRow>();
  for (const a of state.analyticAccounts) rows.set(a.id, { id: a.id, name: a.code ? `[${a.code}] ${a.name}` : a.name, income: 0, expense: 0, balance: 0 });
  for (const it of postedItems(state, { from, to })) {
    const r = it.line.analyticAccountId ? rows.get(it.line.analyticAccountId) : undefined;
    if (!r || !isPnlType(it.account.type)) continue;
    const v = it.line.credit - it.line.debit;
    if (it.account.type.startsWith('income')) r.income += v;
    else r.expense -= v;
  }
  return [...rows.values()].map((r) => ({ ...r, income: round(r.income, d), expense: round(r.expense, d), balance: round(r.income - r.expense, d) }));
}
