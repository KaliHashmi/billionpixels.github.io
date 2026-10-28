// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
import { MOVE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../src/domain/engine';
import { cashPosition, vatReturn } from '../src/domain/management';
import { AGED_BUCKETS, balanceSheet, cashFlow, dashboard, executiveSummary, profitAndLoss } from '../src/domain/reports';
import { createDemoCompany } from '../src/domain/seed';
import { ACCOUNT_TYPE_LABELS, COUNTRIES, CURRENCIES } from '../src/domain/template';
import { ENTITIES, JOURNAL_TYPE_LABELS, VAT_CATEGORY_LABELS } from '../src/features/entities';
import { hasTranslation, translate } from '../src/i18n/translate';

declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const SRC = path.join(__dirname, '..', 'src');

/** Literals that are not user-facing text. */
const UNTRANSLATED = new Set(['PDF', 'English', 'CSV / Excel', 'DEV', 'UAT', 'OMR', 'OM']);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

/** Quoted strings passed to t(...), bi(...) or translate(lang, ...) anywhere in the app. */
function sourceKeys(): Set<string> {
  const keys = new Set<string>();
  const call = /\b(?:t|bi)\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*[,)]/g;
  const ternary = /\bt\(\s*[^()'"]*?\?\s*(['"])((?:(?!\1).)*)\1\s*:\s*(['"])((?:(?!\3).)*)\3\s*\)/g;
  const translateCall = /translate\(\s*[^,]+,\s*(['"])((?:(?!\1).)*)\1/g;
  const errors = /new AccountingError\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  for (const f of walk(SRC)) {
    if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(call)) keys.add(m[2].replace(/\\'/g, "'"));
    for (const m of text.matchAll(ternary)) {
      keys.add(m[2]);
      keys.add(m[4]);
    }
    for (const m of text.matchAll(translateCall)) keys.add(m[2]);
    for (const m of text.matchAll(errors)) keys.add(m[1].replace(/\\'/g, "'"));
    // Labels kept in constant tables of screens (menus, status maps): any capitalised literal.
    if (/[\\/](app|features|ui)[\\/]/.test(f)) {
      for (const m of text.matchAll(/'([A-Z][^'\n]*)'/g)) if (!m[1].includes('/') && !UNTRANSLATED.has(m[1])) keys.add(m[1]);
    }
  }
  return keys;
}

function dataKeys(): Set<string> {
  const s = createDemoCompany();
  const keys = new Set<string>();
  const add = (...xs: (string | undefined)[]) => xs.forEach((x) => x && keys.add(x));
  s.accounts.forEach((a) => add(a.name));
  s.journals.forEach((j) => add(j.name));
  s.taxes.forEach((x) => add(x.name, x.label));
  s.paymentTerms.forEach((x) => add(x.name));
  COUNTRIES.forEach((c) => add(c.name));
  CURRENCIES.forEach((c) => add(c.name));
  for (const m of [ACCOUNT_TYPE_LABELS, MOVE_TYPE_LABELS, PAYMENT_METHOD_LABELS, VAT_CATEGORY_LABELS, JOURNAL_TYPE_LABELS]) Object.values(m).forEach((v) => add(v));
  AGED_BUCKETS.forEach((b) => add(b));
  for (const def of Object.values(ENTITIES)) {
    add(def.title, def.singular);
    for (const f of def.fields) {
      add(f.label, f.hint, f.section);
      f.options?.(s, (k: string) => k).forEach((o) => !/^\d+ /.test(o.label) && add(o.label));
      const err = def.validate?.({ ...def.create(s, {}), code: '!', basicSalary: -1, email: 'x', reverseCharge: true }, s);
      add(err);
    }
  }
  const range = ['2000-01-01', '2099-12-31'] as const;
  profitAndLoss(s, ...range).lines.forEach((l) => !l.accountId && add(l.label));
  balanceSheet(s, range[1]).lines.forEach((l) => !l.accountId && add(l.label));
  cashFlow(s, ...range).lines.forEach((l) => !l.accountId && add(l.label));
  executiveSummary(s, ...range).forEach((l) => add(l.label));
  const v = vatReturn(s, ...range);
  [...v.supplies, ...v.purchases].forEach((l) => add(l.label));
  cashPosition(s, range[1]).inTransit.forEach((i) => add(i.label));
  dashboard(s).cards.forEach((c) => add(c.name, c.primary.label, ...c.secondary.map((x) => x.label)));
  return keys;
}

it('has an Arabic translation for every UI string', () => {
  const keys = [...sourceKeys(), ...dataKeys()].filter((k) => k && /[A-Za-z]/.test(k));
  const missing = [...new Set(keys)].filter((k) => !hasTranslation(k)).sort();
  if (missing.length && process.env.I18N_DUMP) fs.writeFileSync(process.env.I18N_DUMP, JSON.stringify(missing, null, 1));
  expect(missing).toEqual([]);
});

it('fills numbers into templated translations', () => {
  expect(translate('ar', 'VAT 5% (Sales)')).toContain('5');
  expect(translate('en', 'Due {date}', { date: 'x' })).toBe('Due x');
});
