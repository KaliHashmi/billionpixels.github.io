import { ID } from './types';

let counter = 0;
export function newId(): ID {
  counter = (counter + 1) % 1296;
  return (
    Date.now().toString(36) +
    counter.toString(36).padStart(2, '0') +
    Math.random().toString(36).slice(2, 8)
  );
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  // Add a tiny epsilon so values like 1.005 round half-up as accountants expect.
  return Math.round((value + Math.sign(value) * Number.EPSILON * 10) * f) / f;
}

export function isZero(value: number, decimals = 2): boolean {
  return Math.abs(round(value, decimals)) < 0.5 / 10 ** decimals;
}

export function sum<T>(items: T[], fn: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += fn(item);
  return total;
}

export function formatAmount(value: number, decimals = 2, symbol = ''): string {
  const v = round(value, decimals);
  const sign = v < 0 ? '-' : '';
  const [intPart, frac] = Math.abs(v).toFixed(decimals).split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const num = frac ? `${withSep}.${frac}` : withSep;
  return symbol ? `${sign}${symbol} ${num}` : `${sign}${num}`;
}

// ---- Dates (ISO yyyy-mm-dd strings, local calendar) ----

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(s: string, months: number): string {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function endOfMonth(s: string): string {
  const d = parseISODate(s);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01';
}

export function daysBetween(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86400000);
}

/** Fiscal year boundaries containing `date`, for a fiscal year ending at the end of `lastMonth`. */
export function fiscalYear(date: string, lastMonth: number): { start: string; end: string } {
  const d = parseISODate(date);
  let endYear = d.getFullYear();
  if (d.getMonth() + 1 > lastMonth) endYear += 1;
  const end = toISODate(new Date(endYear, lastMonth, 0));
  const start = addDays(toISODate(new Date(endYear - 1, lastMonth, 0)), 1);
  return { start, end };
}

export function formatDate(s?: string): string {
  if (!s) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = parseISODate(s);
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function byId<T extends { id: ID }>(items: T[]): Map<ID, T> {
  const m = new Map<ID, T>();
  for (const it of items) m.set(it.id, it);
  return m;
}
