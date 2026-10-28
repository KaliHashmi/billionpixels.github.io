import { BrandedDocument, documentBranding } from '../domain/branding';
import { invoiceStatus, PAYMENT_METHOD_LABELS } from '../domain/engine';
import { computeInvoiceTotals } from '../domain/tax';
import { AppState, Move, Partner, Payment } from '../domain/types';
import { byId, formatAmount } from '../domain/utils';
import { amountInWords } from '../domain/words';
import { formatDateIn, Lang, translate } from '../i18n/translate';

const esc = (s: string | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2328; font-size: 12px; margin: 28px; }
  h1 { color: #714B67; font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; color: #714B67; }
  .muted { color: #6b7280; }
  .ar { direction: rtl; font-family: "Geeza Pro", "Noto Naskh Arabic", Tahoma, Arial, sans-serif; }
  .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #714B67; padding-bottom: 10px; margin-bottom: 14px; }
  .company { font-size: 15px; font-weight: 700; }
  .title { display: flex; justify-content: space-between; align-items: baseline; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: start; background: #f4f5f7; padding: 5px; font-size: 10px; color: #6b7280; vertical-align: bottom; }
  th .ar { display: block; font-size: 10px; }
  td { padding: 5px; border-bottom: 1px solid #e3e5e8; vertical-align: top; }
  .num { text-align: end; white-space: nowrap; }
  .totals { width: 55%; margin-inline-start: auto; }
  .totals td { border: none; padding: 3px 5px; }
  .grand td { font-weight: 700; font-size: 13px; border-top: 2px solid #1f2328; }
  .bold td { font-weight: 700; }
  .l1 td:first-child { padding-inline-start: 16px; }
  .l2 td:first-child { padding-inline-start: 28px; }
  .footer { margin-top: 28px; border-top: 1px solid #e3e5e8; padding-top: 8px; text-align: center; color: #6b7280; font-size: 10px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 10px 0; }
  .meta b { display: block; font-size: 10px; color: #6b7280; }
  .box { border: 1px solid #e3e5e8; border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
  .field { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dotted #c9ccd1; }
  .field b { font-weight: 600; color: #6b7280; min-width: 120px; }
  .amount { font-size: 18px; font-weight: 800; color: #714B67; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; gap: 24px; }
  .seal { display: flex; justify-content: flex-end; margin-top: 24px; page-break-inside: avoid; }
  .seal-box { width: 250px; text-align: center; }
  .seal-art { position: relative; height: 130px; border-bottom: 1px solid #1f2328; }
  .seal-art .stamp { position: absolute; width: 124px; height: 124px; object-fit: contain; inset-inline-start: 0; top: 3px; }
  .seal-art .signature { position: absolute; max-width: 170px; max-height: 76px; object-fit: contain; inset-inline-end: 6px; bottom: 6px; }
  .seal-label { font-size: 10px; color: #6b7280; margin-top: 4px; }
  .seal-name { font-weight: 600; font-size: 11px; }
  .sign div { flex: 1; border-top: 1px solid #1f2328; padding-top: 4px; text-align: center; color: #6b7280; font-size: 11px; }
`;

/** "English / عربي" label used on bilingual documents. */
const bi = (en: string) => `${esc(en)} <span class="ar">${esc(translate('ar', en))}</span>`;

function doc(body: string, dir: 'ltr' | 'rtl' = 'ltr') {
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

/** Company stamp and authorised signature for an issued document (empty when none is set up). */
function sealHtml(s: AppState, kind: BrandedDocument, issued: boolean): string {
  const b = issued ? documentBranding(s.settings, kind) : undefined;
  if (!b) return '';
  return `<div class="seal"><div class="seal-box">
    <div class="seal-art">
      ${b.stamp ? `<img class="stamp" src="${esc(b.stamp)}" alt=""/>` : ''}
      ${b.signature ? `<img class="signature" src="${esc(b.signature)}" alt=""/>` : ''}
    </div>
    ${b.name ? `<div class="seal-name">${esc(b.name)}${b.title ? ` – ${esc(b.title)}` : ''}</div>` : ''}
    <div class="seal-label">${bi('Authorized Signature & Stamp')}</div>
  </div></div>`;
}

function companyBlock(s: AppState) {
  const c = s.settings;
  return `<div>
    <div class="company">${esc(c.companyName)}</div>
    ${c.companyNameAr ? `<div class="company ar">${esc(c.companyNameAr)}</div>` : ''}
    <div class="muted">${esc(c.companyAddress).replace(/\n/g, '<br/>')}</div>
    <div class="muted">${[c.companyEmail, c.companyPhone].filter(Boolean).map(esc).join(' · ')}</div>
    ${c.companyTaxId ? `<div><b>VATIN ${esc(translate('ar', 'VATIN'))}:</b> ${esc(c.companyTaxId)}</div>` : ''}
  </div>`;
}

function partnerBlock(p: Partner | undefined, label: string) {
  if (!p) return '';
  return `<div style="text-align:end">
    <div class="muted">${bi(label)}</div>
    <div style="font-weight:700">${esc(p.name)}</div>
    <div class="muted">${[p.street, p.city, p.country].filter(Boolean).map(esc).join('<br/>')}</div>
    ${p.taxId ? `<div><b>VATIN:</b> ${esc(p.taxId)}</div>` : ''}
  </div>`;
}

function docTitle(s: AppState, move: Move): string {
  const vat = s.settings.vatRegistered;
  switch (move.moveType) {
    case 'out_invoice':
      return vat ? 'Tax Invoice' : 'Invoice';
    case 'out_refund':
      return vat ? 'Tax Credit Note' : 'Credit Note';
    case 'in_invoice':
      return 'Purchase Invoice';
    case 'in_refund':
      return 'Vendor Credit Note';
    default:
      return 'Journal Entry';
  }
}

/** Bilingual (English/Arabic) tax invoice meeting the content required by the Oman VAT law. */
export function invoiceHtml(s: AppState, move: Move): string {
  const d = s.settings.decimals;
  const fmt = (v: number) => formatAmount(v, d);
  const cur = esc(s.settings.currency);
  const taxes = byId(s.taxes);
  const partner = s.partners.find((p) => p.id === move.partnerId);
  const totals = computeInvoiceTotals(move.invoiceLines, taxes, d);
  const st = invoiceStatus(s, move);
  const title = docTitle(s, move);
  const original = move.reversedEntryId ? s.moves.find((m) => m.id === move.reversedEntryId) : undefined;
  const rows = move.invoiceLines
    .map((l, i) => {
      const lt = totals.lines[i];
      const vat = lt.taxes.filter((x) => !x.reverseCharge).reduce((a, x) => a + x.amount, 0);
      const rates = l.taxIds.map((id) => taxes.get(id)).filter(Boolean).map((tx) => (tx!.amountType === 'percent' ? `${tx!.amount}%` : esc(tx!.label))).join(', ');
      return `<tr><td>${esc(l.label)}</td><td class="num">${l.quantity}</td><td class="num">${fmt(l.priceUnit)}</td>
        <td class="num">${l.discount ? `${l.discount}%` : ''}</td><td class="num">${fmt(lt.untaxed)}</td><td class="num">${rates}</td>
        <td class="num">${fmt(vat)}</td><td class="num">${fmt(lt.untaxed + vat)}</td></tr>`;
    })
    .join('');
  const taxRows = totals.byTax
    .map((x) => {
      const tx = taxes.get(x.taxId);
      return `<tr><td>${esc(tx?.label || tx?.name)}${x.reverseCharge ? ' (reverse charge – payable by recipient)' : ''}</td><td class="num">${fmt(x.amount)}</td></tr>`;
    })
    .join('');
  const meta = [
    [move.moveType.startsWith('out') ? 'Invoice Number' : 'Reference', move.state === 'draft' ? translate('en', 'Draft') : move.name],
    ['Invoice Date', formatDateIn('en', move.invoiceDate ?? move.date)],
    move.dueDate ? ['Due Date', formatDateIn('en', move.dueDate)] : undefined,
    move.ref ? [move.moveType.startsWith('out') ? 'Customer Reference' : 'Bill Reference', move.ref] : undefined,
    original ? ['Original Invoice', `${original.name} (${formatDateIn('en', original.invoiceDate ?? original.date)})`] : undefined,
  ].filter(Boolean) as [string, string][];
  return doc(`
    <div class="header">${companyBlock(s)}${partnerBlock(partner, move.moveType.startsWith('out') ? 'Customer' : 'Vendor')}</div>
    <div class="title"><h1>${esc(title.toUpperCase())}</h1><h1 class="ar">${esc(translate('ar', title))}</h1></div>
    <div class="meta">${meta.map(([k, v]) => `<div><b>${bi(k)}</b>${esc(v)}</div>`).join('')}</div>
    <table>
      <thead><tr>
        <th>${bi('Description')}</th><th class="num">${bi('Qty')}</th><th class="num">${bi('Unit Price')}</th><th class="num">${bi('Disc.')}</th>
        <th class="num">${bi('Taxable Amount')}</th><th class="num">${bi('VAT Rate')}</th><th class="num">${bi('VAT Amount')}</th><th class="num">${bi('Total')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>${bi('Total excluding VAT')}</td><td class="num">${fmt(totals.untaxed)}</td></tr>
      ${taxRows}
      <tr class="grand"><td>${bi('Total including VAT')}</td><td class="num">${cur} ${fmt(totals.total)}</td></tr>
      ${move.state === 'posted' && move.moveType.startsWith('out') ? `<tr><td>${bi('Amount Due')}</td><td class="num">${cur} ${fmt(st.residual)}</td></tr>` : ''}
    </table>
    <p class="muted">${esc(amountInWords(totals.total, s.settings.currency, 'en'))}<br/><span class="ar">${esc(amountInWords(totals.total, s.settings.currency, 'ar'))}</span></p>
    ${move.narration ? `<h2>${bi('Terms and Conditions / Notes')}</h2><div>${esc(move.narration).replace(/\n/g, '<br/>')}</div>` : ''}
    ${sealHtml(s, move.moveType.startsWith('out') ? 'sales' : 'purchases', move.state === 'posted')}
    ${move.moveType.startsWith('out') ? `<div class="footer">${esc(s.settings.invoiceFooter)}</div>` : ''}
  `);
}

/** Receipt voucher (سند قبض) or payment voucher (سند صرف). */
export function voucherHtml(s: AppState, p: Payment): string {
  const d = s.settings.decimals;
  const inbound = p.paymentType === 'inbound';
  const title = inbound ? 'Receipt Voucher' : 'Payment Voucher';
  const partner = s.partners.find((x) => x.id === p.partnerId);
  const account = p.counterpartAccountId ? s.accounts.find((a) => a.id === p.counterpartAccountId) : undefined;
  const journal = s.journals.find((j) => j.id === p.journalId);
  const settled = s.reconciles
    .filter((r) => r.debitMoveId === p.moveId || r.creditMoveId === p.moveId)
    .map((r) => s.moves.find((m) => m.id === (r.debitMoveId === p.moveId ? r.creditMoveId : r.debitMoveId)))
    .filter((m): m is Move => !!m && m.origin !== 'statement' && m.origin !== 'cheque')
    .map((m) => m.name);
  const being = [p.memo, settled.length ? `Settlement of ${settled.join(', ')}` : ''].filter(Boolean).join(' – ');
  const method = PAYMENT_METHOD_LABELS[p.method];
  const field = (label: string, value: string) => `<div class="field"><b>${bi(label)}</b><span>${value}</span></div>`;
  return doc(`
    <div class="header">${companyBlock(s)}<div style="text-align:end">
      <h1>${esc(title.toUpperCase())}</h1><h1 class="ar">${esc(translate('ar', title))}</h1>
      <div><b>No.</b> ${esc(p.name)}</div><div><b>${bi('Date')}</b> ${formatDateIn('en', p.date)}</div>
      ${p.state === 'cancel' ? `<div style="color:#D9534F;font-weight:700">${p.bounced ? 'BOUNCED' : 'CANCELLED'}</div>` : ''}
    </div></div>
    <div class="box">
      ${field(inbound ? 'Received from' : 'Paid to', esc(partner?.name ?? (account ? `${account.code} ${account.name}` : '—')))}
      ${field('The sum of', `${esc(amountInWords(p.amount, s.settings.currency, 'en'))}<br/><span class="ar">${esc(amountInWords(p.amount, s.settings.currency, 'ar'))}</span>`)}
      ${field('Amount', `<span class="amount">${esc(s.settings.currency)} ${formatAmount(p.amount, d)}</span>`)}
      ${field('Payment Method', `${esc(method)} <span class="ar">${esc(translate('ar', method))}</span>${p.method === 'cheque' ? ` – No. ${esc(p.chequeNumber)}${p.chequeBank ? `, ${esc(p.chequeBank)}` : ''}${p.chequeDate ? `, ${formatDateIn('en', p.chequeDate)}` : ''}` : ''}`)}
      ${field(inbound ? 'Deposited to' : 'Paid from', esc(journal?.name ?? ''))}
      ${field('Being', esc(being || '—'))}
    </div>
    ${sealHtml(s, 'vouchers', p.state !== 'cancel')}
    <div class="sign">
      <div>${bi(inbound ? 'Received by' : 'Prepared by')}</div>
      <div>${bi('Accountant')}</div>
      <div>${bi(inbound ? 'Payer Signature' : "Receiver's Signature")}</div>
    </div>
    <div class="footer">${esc(s.settings.companyName)}</div>
  `);
}

export function statementHtml(s: AppState, partner: Partner, items: { move: Move; residual: number; days: number; due?: string }[]): string {
  const d = s.settings.decimals;
  const fmt = (v: number) => formatAmount(v, d);
  const total = items.reduce((x, i) => x + i.residual, 0);
  const overdue = items.filter((i) => i.days > 0).reduce((x, i) => x + i.residual, 0);
  const rows = items
    .map((i) => `<tr><td>${esc(i.move.name)}</td><td>${formatDateIn('en', i.move.date)}</td><td>${formatDateIn('en', i.due)}</td><td class="num">${i.days > 0 ? i.days : ''}</td><td class="num">${fmt(i.residual)}</td></tr>`)
    .join('');
  return doc(`
    <div class="header">${companyBlock(s)}${partnerBlock(partner, 'Customer')}</div>
    <div class="title"><h1>PAYMENT REMINDER</h1><h1 class="ar">${esc(translate('ar', 'Payment Reminder'))}</h1></div>
    <p>Dear ${esc(partner.name)}, our records show the following amounts are still due. If you have already paid, please disregard this message.</p>
    <p class="ar">السادة ${esc(partner.name)}، تشير سجلاتنا إلى أن المبالغ التالية لا تزال مستحقة. يرجى تجاهل هذه الرسالة إذا تم السداد.</p>
    <table><thead><tr><th>${bi('Reference')}</th><th>${bi('Date')}</th><th>${bi('Due Date')}</th><th class="num">${bi('Days Late')}</th><th class="num">${bi('Amount Due')}</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      <tr><td>${bi('Total Overdue')}</td><td class="num">${fmt(overdue)}</td></tr>
      <tr class="grand"><td>${bi('Total Due')}</td><td class="num">${esc(s.settings.currency)} ${fmt(total)}</td></tr>
    </table>
    <div class="footer">${esc(s.settings.invoiceFooter)}</div>
  `);
}

export interface TableReport {
  title: string;
  subtitle: string;
  columns: string[];
  rows: { cells: (string | number)[]; level?: number; bold?: boolean }[];
}

/** Report PDF in the user's language (already translated by the caller). */
export function reportHtml(s: AppState, r: TableReport, lang: Lang = 'en'): string {
  const d = s.settings.decimals;
  const cell = (v: string | number, i: number) => (typeof v === 'number' ? `<td class="num">${formatAmount(v, d)}</td>` : `<td${i > 0 ? ' class="num"' : ''}>${esc(v)}</td>`);
  const rows = r.rows.map((row) => `<tr class="${row.bold ? 'bold' : ''} l${row.level ?? 0}">${row.cells.map(cell).join('')}</tr>`).join('');
  return doc(
    `
    <div class="header">${companyBlock(s)}<div class="muted" style="text-align:end">${esc(r.subtitle)}<br/>${esc(translate(lang, 'Currency'))}: ${esc(s.settings.currency)}</div></div>
    <h1>${esc(r.title)}</h1>
    <table><thead><tr>${r.columns.map((c, i) => `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="footer">Hisab · ${formatDateIn(lang, new Date().toISOString().slice(0, 10))}</div>
  `,
    lang === 'ar' ? 'rtl' : 'ltr',
  );
}
