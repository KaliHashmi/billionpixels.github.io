import { ar } from './ar';

export type Lang = 'en' | 'ar';

const NUM = /\d+(?:[.,]\d+)?/g;

/**
 * Translate an English UI string. Keys are the English text itself; strings that only differ
 * by numbers ("VAT 5% (Sales)", "Payroll 2026-03") fall back to a template with {n} placeholders.
 */
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let out = key;
  if (lang === 'ar' && key) {
    const direct = ar[key];
    if (direct !== undefined) out = direct;
    else {
      const nums = key.match(NUM);
      const tpl = nums ? ar[key.replace(NUM, '{n}')] : undefined;
      if (tpl !== undefined && nums) {
        let i = 0;
        out = tpl.replace(/\{n\}/g, () => nums[i++] ?? '');
      }
    }
  }
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function hasTranslation(key: string): boolean {
  if (ar[key] !== undefined) return true;
  return NUM.test(key) && ar[key.replace(NUM, '{n}')] !== undefined;
}

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

export function formatDateIn(lang: Lang, s?: string): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m) return s;
  return d ? `${String(d).padStart(2, '0')} ${MONTHS[lang][m - 1]} ${y}` : `${MONTHS[lang][m - 1]} ${y}`;
}

export function monthName(lang: Lang, index: number): string {
  return MONTHS[lang][index];
}
