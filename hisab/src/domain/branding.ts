import { Settings } from './types';

/** Which issued documents carry the company stamp and signature. */
export type BrandedDocument = 'sales' | 'purchases' | 'vouchers' | 'reports';

const INK = '#1e3a8a';

const COUNTRY_TITLES: Record<string, [string, string]> = {
  OM: ['SULTANATE OF OMAN', 'سلطنة عُمان'],
  AE: ['UNITED ARAB EMIRATES', 'الإمارات العربية المتحدة'],
  SA: ['KINGDOM OF SAUDI ARABIA', 'المملكة العربية السعودية'],
  BH: ['KINGDOM OF BAHRAIN', 'مملكة البحرين'],
  QA: ['STATE OF QATAR', 'دولة قطر'],
  KW: ['STATE OF KUWAIT', 'دولة الكويت'],
};

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The SVG source inside an `svg+xml` data URI, or undefined for raster images. */
export function svgFromDataUri(uri: string): string | undefined {
  const m = /^data:image\/svg\+xml(;charset=utf-8)?,(.*)$/s.exec(uri);
  return m ? decodeURIComponent(m[2]) : undefined;
}

/** Split text into one line, or two lines of balanced length. */
function balance(text: string, oneLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length <= oneLine || words.length < 2) return words.length ? [words.join(' ')] : [];
  let best = [words.join(' ')];
  for (let i = 1; i < words.length; i++) {
    const pair = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    if (best.length === 1 || Math.max(...pair.map((l) => l.length)) < Math.max(...best.map((l) => l.length))) best = pair;
  }
  return best;
}

/** A round company stamp drawn from the company name, Arabic name and country. */
export function generatedStampSvg(s: Pick<Settings, 'companyName' | 'companyNameAr' | 'country' | 'companyTaxId'>): string {
  const name = (s.companyName || 'Company').toUpperCase();
  const [countryEn, countryAr] = COUNTRY_TITLES[s.country] ?? ['', ''];
  const topSize = Math.min(16, 172 / (name.length * 0.66)).toFixed(1);
  const bottom = countryEn ? `★ ${countryEn} ★` : '★ ★ ★';
  const bottomSize = Math.min(12, 150 / (bottom.length * 0.66)).toFixed(1);
  const arLines = balance(s.companyNameAr || '', 12);
  const arSize = arLines.length ? Math.min(17, 96 / (Math.max(...arLines.map((l) => l.length)) * 0.46)) : 0;
  const centre: string[] = [];
  if (arLines.length) {
    const lineH = arSize * 1.25;
    const top = 100 - (arLines.length * lineH) / 2 - (countryAr ? 7 : 0) + arSize * 0.8;
    arLines.forEach((l, i) =>
      centre.push(`<text x="100" y="${(top + i * lineH).toFixed(1)}" font-size="${arSize.toFixed(1)}" font-weight="700" text-anchor="middle" direction="rtl">${xml(l)}</text>`),
    );
    const ruleY = top + (arLines.length - 1) * lineH + 6;
    if (countryAr) {
      centre.push(`<line x1="70" y1="${ruleY.toFixed(1)}" x2="130" y2="${ruleY.toFixed(1)}" stroke="${INK}" stroke-width="1"/>`);
      centre.push(`<text x="100" y="${(ruleY + 13).toFixed(1)}" font-size="10" text-anchor="middle" direction="rtl">${xml(countryAr)}</text>`);
    }
  } else {
    centre.push(`<text x="100" y="108" font-size="26" text-anchor="middle">★</text>`);
  }
  const vat = s.companyTaxId ? `<text x="100" y="146" font-size="7.5" text-anchor="middle" letter-spacing="0.5">${xml(s.companyTaxId)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
<defs><path id="top" d="M 28 100 A 72 72 0 0 1 172 100"/><path id="bottom" d="M 18 100 A 82 82 0 0 0 182 100"/></defs>
<g fill="${INK}" stroke="none" font-family="Arial, Helvetica, sans-serif" opacity="0.88" transform="rotate(-8 100 100)">
<circle cx="100" cy="100" r="96" fill="none" stroke="${INK}" stroke-width="4"/>
<circle cx="100" cy="100" r="89" fill="none" stroke="${INK}" stroke-width="1.2"/>
<circle cx="100" cy="100" r="60" fill="none" stroke="${INK}" stroke-width="1.2"/>
<text font-size="${topSize}" font-weight="700" letter-spacing="1"><textPath href="#top" startOffset="50%" text-anchor="middle">${xml(name)}</textPath></text>
<text font-size="${bottomSize}" font-weight="700" letter-spacing="1"><textPath href="#bottom" startOffset="50%" text-anchor="middle">${xml(bottom)}</textPath></text>
<g font-family="'Geeza Pro', 'Noto Naskh Arabic', Tahoma, Arial, sans-serif">${centre.join('')}</g>
${vat}
</g></svg>`;
}

export type Point = [number, number];

/** A hand-drawn signature as SVG, cropped to the ink. Returns undefined when nothing was drawn. */
export function signatureSvg(strokes: Point[][]): string | undefined {
  const pts = strokes.flat();
  if (pts.length < 2) return undefined;
  const pad = 6;
  const minX = Math.min(...pts.map((p) => p[0])) - pad;
  const minY = Math.min(...pts.map((p) => p[1])) - pad;
  const w = Math.max(...pts.map((p) => p[0])) + pad - minX;
  const h = Math.max(...pts.map((p) => p[1])) + pad - minY;
  const r = (v: number) => Math.round(v * 10) / 10;
  const paths = strokes
    .filter((st) => st.length)
    .map((st) => {
      const p = st.map(([x, y]) => [r(x - minX), r(y - minY)] as Point);
      if (p.length === 1) return `M${p[0][0]} ${p[0][1]}l0.1 0`;
      // Quadratic curves through the midpoints keep the line smooth.
      let d = `M${p[0][0]} ${p[0][1]}`;
      for (let i = 1; i < p.length - 1; i++) d += `Q${p[i][0]} ${p[i][1]} ${r((p[i][0] + p[i + 1][0]) / 2)} ${r((p[i][1] + p[i + 1][1]) / 2)}`;
      const last = p[p.length - 1];
      return `${d}L${last[0]} ${last[1]}`;
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}"><path d="${paths.join('')}" fill="none" stroke="#0b2a6b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** The stamp image (data URI) to print, if any. Companies that never chose get the generated stamp. */
export function stampSource(s: Settings): string | undefined {
  if ((s.stampMode ?? 'generated') === 'generated') return svgDataUri(generatedStampSvg(s));
  if (s.stampMode === 'image') return s.stampImage;
  return undefined;
}

/** Every document type carries the stamp unless switched off in Stamp & Signature. */
export function brandingApplies(s: Settings, kind: BrandedDocument): boolean {
  if (kind === 'sales') return s.brandSales ?? true;
  if (kind === 'vouchers') return s.brandVouchers ?? true;
  if (kind === 'reports') return s.brandReports ?? true;
  return s.brandPurchases ?? true;
}

/** Stamp and signature to print on a document, or undefined when there is nothing to print. */
export function documentBranding(s: Settings, kind: BrandedDocument, draft = false): { stamp?: string; signature?: string; name?: string; title?: string } | undefined {
  if (!brandingApplies(s, kind) || (draft && s.brandDrafts === false)) return undefined;
  const stamp = stampSource(s);
  const signature = s.signatureImage;
  if (!stamp && !signature) return undefined;
  return { stamp, signature, name: s.signatoryName, title: s.signatoryTitle };
}

export const DEMO_COMPANY_NAME = 'Hisab Demo Trading LLC';

/** A handwriting-like scribble for the demo signature: a looped capital, a run of letters and an underline. */
export function demoSignature(): Point[][] {
  const word: Point[] = [];
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    const a = t * Math.PI * 2 * 5.5;
    // A tall opening loop, then smaller uneven letters that drift slightly upwards.
    const size = t < 0.18 ? 26 : 13 - 6 * t;
    const loop = t < 0.18 ? 14 : 8;
    const y = 52 - 8 * t - size * Math.cos(a) * (0.75 + 0.25 * Math.sin(2.3 * a));
    // Slant the letters to the right like handwriting.
    word.push([16 + 170 * t + loop * Math.sin(a) + 0.35 * (52 - y), y]);
  }
  const underline: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    underline.push([200 - 185 * t, 70 + 12 * t - 9 * Math.sin(t * Math.PI)]);
  }
  return [word, underline];
}

/** Stamp and signature settings of the demo company. */
export function demoBranding(): Partial<Settings> {
  return { stampMode: 'generated', signatureImage: svgDataUri(signatureSvg(demoSignature())!), signatoryName: 'Ahmed Al Balushi', signatoryTitle: 'General Manager' };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
