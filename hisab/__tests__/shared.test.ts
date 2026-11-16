import { addPostedEntry } from '../src/domain/engine';
import { newId } from '../src/domain/utils';
import { createDemoCompany } from '../src/domain/seed';
import { matchesSearch } from '../src/ui/search';

describe('addPostedEntry: the one place Hisab makes its own posted entries', () => {
  const lines = (accountA: string, accountB: string) => [
    { id: newId(), accountId: accountA, label: 'x', debit: 10, credit: 0, kind: 'other' as const },
    { id: newId(), accountId: accountB, label: 'x', debit: 0, credit: 10, kind: 'other' as const },
  ];

  it('posts the entry with the next number of its journal and keeps the rest of the books', () => {
    const s = createDemoCompany();
    const general = s.journals.find((j) => j.type === 'general')!;
    const [a, b] = s.accounts;
    const before = s.sequences[`${general.code}/2026`] ?? 0;
    const { state, move } = addPostedEntry(s, { journalId: general.id, date: '2026-03-31', ref: 'Test', lines: lines(a.id, b.id), origin: 'asset', originId: 'asset-1' });
    expect(state.moves).toHaveLength(s.moves.length + 1);
    expect(state.moves.at(-1)).toBe(move);
    expect(move).toMatchObject({ moveType: 'entry', state: 'posted', journalId: general.id, date: '2026-03-31', ref: 'Test', origin: 'asset', originId: 'asset-1', narration: '', invoiceLines: [] });
    expect(move.name).toBe(`${general.code}/2026/${String(before + 1).padStart(5, '0')}`);
    expect(state.sequences[`${general.code}/2026`]).toBe(before + 1);
    expect(move.postedAt).toBe(move.createdAt);
    expect(s.moves).toHaveLength(state.moves.length - 1); // the old state is untouched
  });

  it('records the partner only when one is given', () => {
    const s = createDemoCompany();
    const bank = s.journals.find((j) => j.type === 'bank')!;
    const [a, b] = s.accounts;
    const partner = s.partners[0];
    const withPartner = addPostedEntry(s, { journalId: bank.id, partnerId: partner.id, date: '2026-04-01', ref: 'P', lines: lines(a.id, b.id), origin: 'statement', originId: 'sl' }).move;
    const without = addPostedEntry(s, { journalId: bank.id, date: '2026-04-01', ref: 'P', lines: lines(a.id, b.id), origin: 'statement', originId: 'sl' }).move;
    expect(withPartner.partnerId).toBe(partner.id);
    expect(without.partnerId).toBeUndefined();
  });

  it('numbers consecutive entries one after another', () => {
    const s = createDemoCompany();
    const general = s.journals.find((j) => j.type === 'general')!;
    const [a, b] = s.accounts;
    const entry = { journalId: general.id, date: '2026-05-01', ref: 'R', lines: lines(a.id, b.id), origin: 'payroll' as const, originId: 'r' };
    const first = addPostedEntry(s, entry);
    const second = addPostedEntry(first.state, entry);
    expect(second.move.name > first.move.name).toBe(true);
    expect(second.move.id).not.toBe(first.move.id);
  });
});

describe('matchesSearch: the search box on list screens', () => {
  it('shows everything while nothing (or only spaces) is typed', () => {
    expect(matchesSearch('', 'INV/2026/00001')).toBe(true);
    expect(matchesSearch('   ')).toBe(true);
  });

  it('matches any value, ignoring case and surrounding spaces', () => {
    expect(matchesSearch(' muscat ', 'INV/2026/00001', 'Muscat Trading LLC')).toBe(true);
    expect(matchesSearch('inv/2026', 'INV/2026/00001')).toBe(true);
    expect(matchesSearch('bausher', 'INV/2026/00001', 'Muscat Trading LLC')).toBe(false);
  });

  it('matches numbers and skips missing values', () => {
    expect(matchesSearch('15.75', 15.75)).toBe(true);
    expect(matchesSearch('x', undefined, null, false, '')).toBe(false);
    expect(matchesSearch('shell', undefined, false, 'Shell Bausher')).toBe(true);
  });

  it('works for Arabic text', () => {
    expect(matchesSearch('مسقط', 'شركة مسقط للتجارة')).toBe(true);
  });
});
