import { checkLockDate, getJournal, nextSequence } from './engine';
import { AccountingError, AppState, Asset, ID, Move } from './types';
import { addMonths, endOfMonth, isValidISODate, isZero, newId, round } from './utils';

export interface DepreciationRow {
  index: number;
  date: string;
  amount: number;
  cumulative: number;
  remaining: number;
  moveId?: ID;
}

/** Straight-line monthly depreciation board. */
export function depreciationBoard(asset: Asset, decimals: number): DepreciationRow[] {
  const base = round(asset.originalValue - asset.salvageValue, decimals);
  const n = Math.max(1, Math.round(asset.durationMonths));
  const monthly = round(base / n, decimals);
  const rows: DepreciationRow[] = [];
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? round(base - cumulative, decimals) : monthly;
    cumulative = round(cumulative + amount, decimals);
    rows.push({
      index: i,
      date: endOfMonth(addMonths(asset.firstDepreciationDate, i)),
      amount,
      cumulative,
      remaining: round(base - cumulative, decimals),
      moveId: asset.depreciationMoveIds[i],
    });
  }
  return rows;
}

export function saveAsset(state: AppState, asset: Asset): AppState {
  const existing = state.assets.find((a) => a.id === asset.id);
  if (existing && existing.state !== 'draft') throw new AccountingError('Only draft assets can be modified.');
  if (!asset.name.trim()) throw new AccountingError('Asset name is required.');
  if (!isValidISODate(asset.acquisitionDate) || !isValidISODate(asset.firstDepreciationDate)) {
    throw new AccountingError('Invalid date.');
  }
  if (!(asset.originalValue > 0)) throw new AccountingError('Original value must be positive.');
  if (asset.salvageValue < 0 || asset.salvageValue >= asset.originalValue) {
    throw new AccountingError('Salvage value must be between 0 and the original value.');
  }
  if (!(asset.durationMonths >= 1)) throw new AccountingError('Duration must be at least one month.');
  const assets = existing ? state.assets.map((a) => (a.id === asset.id ? asset : a)) : [...state.assets, asset];
  return { ...state, assets };
}

export function confirmAsset(state: AppState, assetId: ID): AppState {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) throw new AccountingError('Asset not found.');
  if (asset.state !== 'draft') return state;
  return { ...state, assets: state.assets.map((a) => (a.id === assetId ? { ...a, state: 'running' } : a)) };
}

export function deleteAsset(state: AppState, assetId: ID): AppState {
  const asset = state.assets.find((a) => a.id === assetId);
  if (asset && asset.state !== 'draft') throw new AccountingError('Only draft assets can be deleted.');
  return { ...state, assets: state.assets.filter((a) => a.id !== assetId) };
}

/** Post all depreciation entries due up to `untilDate`. */
export function postDepreciations(state: AppState, assetId: ID, untilDate: string): AppState {
  const { decimals } = state.settings;
  let asset = state.assets.find((a) => a.id === assetId);
  if (!asset) throw new AccountingError('Asset not found.');
  if (asset.state !== 'running') throw new AccountingError('Confirm the asset first.');
  const journal = getJournal(state, asset.journalId);
  let next = state;
  const board = depreciationBoard(asset, decimals);
  const moveIds = [...asset.depreciationMoveIds];
  for (const row of board) {
    if (row.index < moveIds.length) continue;
    if (row.date > untilDate) break;
    if (isZero(row.amount, decimals)) {
      moveIds.push('');
      continue;
    }
    checkLockDate(next, row.date);
    const seq = nextSequence(next, journal.code, row.date);
    next = seq.state;
    const label = `${asset.name}: Depreciation ${row.index + 1}/${board.length}`;
    const move: Move = {
      id: newId(),
      moveType: 'entry',
      name: seq.name,
      state: 'posted',
      journalId: journal.id,
      date: row.date,
      ref: label,
      narration: '',
      invoiceLines: [],
      lines: [
        { id: newId(), accountId: asset.expenseAccountId, label, debit: row.amount, credit: 0, kind: 'other' },
        { id: newId(), accountId: asset.depreciationAccountId, label, debit: 0, credit: row.amount, kind: 'other' },
      ],
      origin: 'asset',
      originId: asset.id,
      createdAt: new Date().toISOString(),
      postedAt: new Date().toISOString(),
    };
    next = { ...next, moves: [...next.moves, move] };
    moveIds.push(move.id);
  }
  asset = { ...asset, depreciationMoveIds: moveIds, state: moveIds.length >= board.length ? 'closed' : 'running' };
  return { ...next, assets: next.assets.map((a) => (a.id === assetId ? asset! : a)) };
}

/** Post due depreciation for every running asset. */
export function postAllDepreciations(state: AppState, untilDate: string): AppState {
  let next = state;
  for (const a of state.assets) if (a.state === 'running') next = postDepreciations(next, a.id, untilDate);
  return next;
}
