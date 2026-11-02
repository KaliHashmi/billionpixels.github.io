// Profit & Loss, Balance Sheet, Cash Flow and Executive Summary.
import { isPnlType } from '../template';
import { Account, AccountType, AppState, ID } from '../types';
import { addDays, byId, fiscalYear, isZero, round } from '../utils';
import { balancesByAccount, postedItems, trialBalance } from './base';

// ---------------------------------------------------------------------------
// Profit & Loss / Balance sheet
// ---------------------------------------------------------------------------

export interface ReportLine {
  label: string;
  amount: number;
  accountId?: ID;
  level: 0 | 1 | 2;
  bold?: boolean;
}

function sectionLines(
  state: AppState,
  balances: Map<ID, { debit: number; credit: number }>,
  types: AccountType[],
  sign: 1 | -1,
): { lines: ReportLine[]; total: number } {
  const d = state.settings.decimals;
  const lines: ReportLine[] = [];
  let total = 0;
  for (const a of [...state.accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    if (!types.includes(a.type)) continue;
    const b = balances.get(a.id);
    if (!b) continue;
    const amount = round(sign * (b.debit - b.credit), d);
    if (isZero(amount, d)) continue;
    total += amount;
    lines.push({ label: `${a.code} ${a.name}`, amount, accountId: a.id, level: 2 });
  }
  return { lines, total: round(total, d) };
}

export interface ProfitAndLoss {
  lines: ReportLine[];
  revenue: number;
  grossProfit: number;
  netProfit: number;
}

export function profitAndLoss(state: AppState, from: string, to: string): ProfitAndLoss {
  const d = state.settings.decimals;
  const balances = balancesByAccount(postedItems(state, { from, to }));
  const rev = sectionLines(state, balances, ['income'], -1);
  const cor = sectionLines(state, balances, ['expense_direct_cost'], 1);
  const oth = sectionLines(state, balances, ['income_other'], -1);
  const exp = sectionLines(state, balances, ['expense'], 1);
  const dep = sectionLines(state, balances, ['expense_depreciation'], 1);
  const grossProfit = round(rev.total - cor.total, d);
  const netProfit = round(grossProfit + oth.total - exp.total - dep.total, d);
  const lines: ReportLine[] = [
    { label: 'Revenue', amount: rev.total, level: 0, bold: true },
    ...rev.lines,
    { label: 'Cost of Revenue', amount: cor.total, level: 0, bold: true },
    ...cor.lines,
    { label: 'Gross Profit', amount: grossProfit, level: 0, bold: true },
    { label: 'Other Income', amount: oth.total, level: 0, bold: true },
    ...oth.lines,
    { label: 'Expenses', amount: exp.total, level: 0, bold: true },
    ...exp.lines,
    { label: 'Depreciation', amount: dep.total, level: 0, bold: true },
    ...dep.lines,
    { label: 'Net Profit', amount: netProfit, level: 0, bold: true },
  ];
  return { lines, revenue: rev.total, grossProfit, netProfit };
}

export interface BalanceSheet {
  lines: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export function balanceSheet(state: AppState, date: string): BalanceSheet {
  const d = state.settings.decimals;
  const fy = fiscalYear(date, state.settings.fiscalYearLastMonth);
  const items = postedItems(state, { to: date });
  const balances = balancesByAccount(items);

  const curAssets = sectionLines(state, balances, ['asset_receivable', 'asset_cash', 'asset_current', 'asset_prepayments'], 1);
  const fixed = sectionLines(state, balances, ['asset_fixed'], 1);
  const nonCur = sectionLines(state, balances, ['asset_non_current'], 1);
  const curLiab = sectionLines(state, balances, ['liability_payable', 'liability_credit_card', 'liability_current'], -1);
  const nonCurLiab = sectionLines(state, balances, ['liability_non_current'], -1);
  const equity = sectionLines(state, balances, ['equity'], -1);

  let currentEarnings = 0;
  let previousEarnings = 0;
  for (const it of items) {
    const isPnl = isPnlType(it.account.type);
    if (!isPnl && it.account.type !== 'equity_unaffected') continue;
    const v = it.line.credit - it.line.debit;
    if (isPnl && it.move.date >= fy.start) currentEarnings += v;
    else previousEarnings += v;
  }
  currentEarnings = round(currentEarnings, d);
  previousEarnings = round(previousEarnings, d);

  const totalAssets = round(curAssets.total + fixed.total + nonCur.total, d);
  const totalLiabilities = round(curLiab.total + nonCurLiab.total, d);
  const totalEquity = round(equity.total + currentEarnings + previousEarnings, d);

  const lines: ReportLine[] = [
    { label: 'ASSETS', amount: totalAssets, level: 0, bold: true },
    { label: 'Current Assets', amount: curAssets.total, level: 1, bold: true },
    ...curAssets.lines,
    { label: 'Fixed Assets', amount: fixed.total, level: 1, bold: true },
    ...fixed.lines,
    { label: 'Non-current Assets', amount: nonCur.total, level: 1, bold: true },
    ...nonCur.lines,
    { label: 'LIABILITIES', amount: totalLiabilities, level: 0, bold: true },
    { label: 'Current Liabilities', amount: curLiab.total, level: 1, bold: true },
    ...curLiab.lines,
    { label: 'Non-current Liabilities', amount: nonCurLiab.total, level: 1, bold: true },
    ...nonCurLiab.lines,
    { label: 'EQUITY', amount: totalEquity, level: 0, bold: true },
    ...equity.lines,
    { label: 'Current Year Unallocated Earnings', amount: currentEarnings, level: 2 },
    { label: 'Previous Years Unallocated Earnings', amount: previousEarnings, level: 2 },
    { label: 'LIABILITIES + EQUITY', amount: round(totalLiabilities + totalEquity, d), level: 0, bold: true },
  ];
  return { lines, totalAssets, totalLiabilities, totalEquity };
}


// ---------------------------------------------------------------------------
// Cash flow, executive summary, journal audit, analytic
// ---------------------------------------------------------------------------

function cashFlowCategory(t: AccountType): 'operating' | 'investing' | 'financing' {
  if (t === 'asset_fixed' || t === 'asset_non_current') return 'investing';
  if (t === 'equity' || t === 'equity_unaffected' || t === 'liability_non_current') return 'financing';
  return 'operating';
}

export interface CashFlow {
  opening: number;
  operating: number;
  investing: number;
  financing: number;
  closing: number;
  lines: ReportLine[];
}

/** Direct-method cash flow: counterparts of every movement on bank & cash accounts. */
export function cashFlow(state: AppState, from: string, to: string): CashFlow {
  const d = state.settings.decimals;
  const isCash = (a: Account) => a.type === 'asset_cash';
  const opening = round(postedItems(state, { to: addDays(from, -1) }).filter((i) => isCash(i.account)).reduce((s, i) => s + i.line.debit - i.line.credit, 0), d);
  const totals = { operating: 0, investing: 0, financing: 0 };
  const perAccount = new Map<ID, { account: Account; amount: number }>();
  const accounts = byId(state.accounts);
  for (const move of state.moves) {
    if (move.state !== 'posted' || move.date < from || move.date > to) continue;
    const hasCash = move.lines.some((l) => { const a = accounts.get(l.accountId); return a && isCash(a); });
    if (!hasCash) continue;
    for (const l of move.lines) {
      const a = accounts.get(l.accountId);
      if (!a || isCash(a)) continue;
      const v = l.credit - l.debit;
      totals[cashFlowCategory(a.type)] += v;
      const e = perAccount.get(a.id) ?? { account: a, amount: 0 };
      e.amount += v;
      perAccount.set(a.id, e);
    }
  }
  const lines: ReportLine[] = [{ label: 'Cash at beginning of period', amount: opening, level: 0, bold: true }];
  for (const cat of ['operating', 'investing', 'financing'] as const) {
    lines.push({ label: `Net cash from ${cat} activities`, amount: round(totals[cat], d), level: 0, bold: true });
    for (const e of [...perAccount.values()].filter((x) => cashFlowCategory(x.account.type) === cat).sort((a, b) => a.account.code.localeCompare(b.account.code))) {
      if (!isZero(e.amount, d)) lines.push({ label: `${e.account.code} ${e.account.name}`, amount: round(e.amount, d), accountId: e.account.id, level: 2 });
    }
  }
  const closing = round(opening + totals.operating + totals.investing + totals.financing, d);
  lines.push({ label: 'Cash at end of period', amount: closing, level: 0, bold: true });
  return { opening, closing, lines, operating: round(totals.operating, d), investing: round(totals.investing, d), financing: round(totals.financing, d) };
}

export function executiveSummary(state: AppState, from: string, to: string): ReportLine[] {
  const d = state.settings.decimals;
  const pl = profitAndLoss(state, from, to);
  const bs = balanceSheet(state, to);
  const tb = trialBalance(state, from, to).rows;
  const sumTypes = (types: AccountType[], sign: 1 | -1) => round(tb.filter((r) => types.includes(r.account.type)).reduce((s, r) => s + sign * r.end, 0), d);
  const cash = sumTypes(['asset_cash'], 1);
  const receivables = sumTypes(['asset_receivable'], 1);
  const payables = sumTypes(['liability_payable'], -1);
  const currentAssets = sumTypes(['asset_cash', 'asset_receivable', 'asset_current', 'asset_prepayments'], 1);
  const currentLiabilities = sumTypes(['liability_current', 'liability_payable', 'liability_credit_card'], -1);
  const cf = cashFlow(state, from, to);
  const pct = (a: number, b: number) => (isZero(b, d) ? 0 : round((a / b) * 100, 2));
  return [
    { label: 'Cash', amount: 0, level: 0, bold: true },
    { label: 'Cash received', amount: round(postedItems(state, { from, to }).filter((i) => i.account.type === 'asset_cash').reduce((s, i) => s + i.line.debit, 0), d), level: 2 },
    { label: 'Cash spent', amount: round(-postedItems(state, { from, to }).filter((i) => i.account.type === 'asset_cash').reduce((s, i) => s + i.line.credit, 0), d), level: 2 },
    { label: 'Cash surplus', amount: round(cf.closing - cf.opening, d), level: 2 },
    { label: 'Closing bank balance', amount: cash, level: 2 },
    { label: 'Profitability', amount: 0, level: 0, bold: true },
    { label: 'Income', amount: pl.revenue, level: 2 },
    { label: 'Gross profit', amount: pl.grossProfit, level: 2 },
    { label: 'Net profit', amount: pl.netProfit, level: 2 },
    { label: 'Gross profit margin (%)', amount: pct(pl.grossProfit, pl.revenue), level: 2 },
    { label: 'Net profit margin (%)', amount: pct(pl.netProfit, pl.revenue), level: 2 },
    { label: 'Balance Sheet', amount: 0, level: 0, bold: true },
    { label: 'Receivables', amount: receivables, level: 2 },
    { label: 'Payables', amount: payables, level: 2 },
    { label: 'Net assets', amount: round(bs.totalAssets - bs.totalLiabilities, d), level: 2 },
    { label: 'Current ratio', amount: isZero(currentLiabilities, d) ? 0 : round(currentAssets / currentLiabilities, 2), level: 2 },
  ];
}
