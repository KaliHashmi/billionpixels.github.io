// Posted journal items, account balances and the trial balance.
import { isPnlType } from '../template';
import { Account, AppState, ID, Move, MoveLine } from '../types';
import { addDays, byId, fiscalYear, round } from '../utils';

export interface Item {
  move: Move;
  line: MoveLine;
  account: Account;
}

export interface Period {
  from?: string;
  to?: string;
}

export function postedItems(state: AppState, period: Period = {}): Item[] {
  const accounts = byId(state.accounts);
  const out: Item[] = [];
  for (const move of state.moves) {
    if (move.state !== 'posted') continue;
    if (period.from && move.date < period.from) continue;
    if (period.to && move.date > period.to) continue;
    for (const line of move.lines) {
      const account = accounts.get(line.accountId);
      if (account) out.push({ move, line, account });
    }
  }
  return out.sort((a, b) => a.move.date.localeCompare(b.move.date) || a.move.name.localeCompare(b.move.name));
}

/** @internal shared by the report modules */
export function balancesByAccount(items: Item[]): Map<ID, { debit: number; credit: number }> {
  const m = new Map<ID, { debit: number; credit: number }>();
  for (const it of items) {
    const b = m.get(it.account.id) ?? { debit: 0, credit: 0 };
    b.debit += it.line.debit;
    b.credit += it.line.credit;
    m.set(it.account.id, b);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  account: Account;
  initial: number;
  debit: number;
  credit: number;
  end: number;
}

export function trialBalance(state: AppState, from: string, to: string): { rows: TrialBalanceRow[]; totals: Omit<TrialBalanceRow, 'account'> } {
  const d = state.settings.decimals;
  const fyStart = fiscalYear(from, state.settings.fiscalYearLastMonth).start;
  const before = postedItems(state, { to: addDays(from, -1) }).filter(
    // P&L accounts restart every fiscal year.
    (it) => !isPnlType(it.account.type) || it.move.date >= fyStart,
  );
  const initial = balancesByAccount(before);
  const period = balancesByAccount(postedItems(state, { from, to }));
  const rows: TrialBalanceRow[] = [];
  for (const account of [...state.accounts].sort((a, b) => a.code.localeCompare(b.code))) {
    const i = initial.get(account.id);
    const p = period.get(account.id);
    if (!i && !p) continue;
    const init = round((i?.debit ?? 0) - (i?.credit ?? 0), d);
    const debit = round(p?.debit ?? 0, d);
    const credit = round(p?.credit ?? 0, d);
    rows.push({ account, initial: init, debit, credit, end: round(init + debit - credit, d) });
  }
  const totals = {
    initial: round(rows.reduce((s, r) => s + r.initial, 0), d),
    debit: round(rows.reduce((s, r) => s + r.debit, 0), d),
    credit: round(rows.reduce((s, r) => s + r.credit, 0), d),
    end: round(rows.reduce((s, r) => s + r.end, 0), d),
  };
  return { rows, totals };
}
