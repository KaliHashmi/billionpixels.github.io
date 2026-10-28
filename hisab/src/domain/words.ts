/** Amounts in words for vouchers and cheques (English and Arabic). */

const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function enUnder1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${EN_ONES[Math.floor(n / 100)]} Hundred`);
  const r = n % 100;
  if (r) parts.push(r < 20 ? EN_ONES[r] : `${EN_TENS[Math.floor(r / 10)]}${r % 10 ? `-${EN_ONES[r % 10]}` : ''}`);
  return parts.join(' and ');
}

export function numberToWordsEn(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const scales = ['', ' Thousand', ' Million', ' Billion'];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(enUnder1000(chunk) + scales[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}

const AR_ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const AR_HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function arUnder1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(AR_HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r) parts.push(r < 20 ? AR_ONES[r] : AR_ONES[r % 10] ? `${AR_ONES[r % 10]} و${AR_TENS[Math.floor(r / 10)]}` : AR_TENS[Math.floor(r / 10)]);
  return parts.join(' و');
}

function arScale(n: number, one: string, two: string, few: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${arUnder1000(n)} ${few}`;
  return `${arUnder1000(n)} ${one}`;
}

export function numberToWordsAr(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'صفر';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(arScale(millions, 'مليون', 'مليونان', 'ملايين'));
  if (thousands) parts.push(arScale(thousands, 'ألف', 'ألفان', 'آلاف'));
  if (rest) parts.push(arUnder1000(rest));
  return parts.join(' و');
}

const CURRENCY_WORDS: Record<string, { en: [string, string]; ar: [string, string]; sub: number }> = {
  OMR: { en: ['Omani Rials', 'Baisa'], ar: ['ريال عماني', 'بيسة'], sub: 1000 },
  AED: { en: ['UAE Dirhams', 'Fils'], ar: ['درهم إماراتي', 'فلس'], sub: 100 },
  SAR: { en: ['Saudi Riyals', 'Halalas'], ar: ['ريال سعودي', 'هللة'], sub: 100 },
  KWD: { en: ['Kuwaiti Dinars', 'Fils'], ar: ['دينار كويتي', 'فلس'], sub: 1000 },
  BHD: { en: ['Bahraini Dinars', 'Fils'], ar: ['دينار بحريني', 'فلس'], sub: 1000 },
  QAR: { en: ['Qatari Riyals', 'Dirhams'], ar: ['ريال قطري', 'درهم'], sub: 100 },
};

export function amountInWords(amount: number, currency: string, lang: 'en' | 'ar'): string {
  const c = CURRENCY_WORDS[currency] ?? { en: [currency, 'cents'] as [string, string], ar: [currency, 'جزء'] as [string, string], sub: 100 };
  const whole = Math.floor(Math.abs(amount) + 1e-9);
  const fraction = Math.round((Math.abs(amount) - whole) * c.sub);
  if (lang === 'ar') {
    const main = `${numberToWordsAr(whole)} ${c.ar[0]}`;
    return `فقط ${main}${fraction ? ` و${numberToWordsAr(fraction)} ${c.ar[1]}` : ''} لا غير`;
  }
  return `${numberToWordsEn(whole)} ${c.en[0]}${fraction ? ` and ${numberToWordsEn(fraction)} ${c.en[1]}` : ''} Only`;
}
