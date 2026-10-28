import { invoiceStatus, MOVE_TYPE_LABELS } from '../domain/engine';
import { computeInvoiceTotals } from '../domain/tax';
import { AppState, Move, Partner } from '../domain/types';
import { byId, formatAmount, formatDate, today } from '../domain/utils';

const esc = (s: string | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1f2328; font-size: 12px; margin: 32px; }
  h1 { color: #714B67; font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; color: #714B67; }
  .muted { color: #6b7280; }
  .header { display: flex; justify-content: space-between; border-bottom: 3px solid #714B67; padding-bottom: 12px; margin-bottom: 18px; }
  .company { font-size: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; background: #f4f5f7; padding: 6px; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  td { padding: 6px; border-bottom: 1px solid #e3e5e8; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 45%; margin-left: auto; }
  .totals td { border: none; padding: 4px 6px; }
  .grand td { font-weight: 700; font-size: 14px; border-top: 2px solid #1f2328; }
  .bold td { font-weight: 700; }
  .l1 td:first-child { padding-left: 16px; }
  .l2 td:first-child { padding-left: 28px; }
  .footer { margin-top: 32px; border-top: 1px solid #e3e5e8; padding-top: 8px; text-align: center; color: #6b7280; font-size: 11px; }
  .meta { display: flex; gap: 32px; margin: 12px 0; }
  .meta div b { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; }
`;

function companyBlock(s: AppState) {
  const c = s.settings;
  return `<div>
    <div class="company">${esc(c.companyName)}</div>
    <div class="muted">${esc(c.companyAddress).replace(/\n/g, '<br/>')}</div>
    <div class="muted">${[c.companyEmail, c.companyPhone].filter(Boolean).map(esc).join(' · ')}</div>
    ${c.companyTaxId ? `<div class="muted">Tax ID: ${esc(c.companyTaxId)}</div>` : ''}
  </div>`;
}

function partnerBlock(p?: Partner) {
  if (!p) return '';
  return `<div style="text-align:right">
    <div style="font-weight:700">${esc(p.name)}</div>
    <div class="muted">${[p.street, p.city, p.country].filter(Boolean).map(esc).join('<br/>')}</div>
    ${p.taxId ? `<div class="muted">Tax ID: ${esc(p.taxId)}</div>` : ''}
  </div>`;
}

export function invoiceHtml(s: AppState, move: Move): string {
  const d = s.settings.decimals;
  const fmt = (v: number) => formatAmount(v, d);
  const taxes = byId(s.taxes);
  const partner = s.partners.find((p) => p.id === move.partnerId);
  const totals = computeInvoiceTotals(move.invoiceLines, taxes, d);
  const st = invoiceStatus(s, move);
  const title = move.state === 'draft' ? `Draft ${MOVE_TYPE_LABELS[move.moveType]}` : `${MOVE_TYPE_LABELS[move.moveType]} ${move.name}`;
  const rows = move.invoiceLines
    .map((l, i) => {
      const tx = l.taxIds.map((id) => taxes.get(id)?.label || taxes.get(id)?.name).filter(Boolean).join(', ');
      return `<tr><td>${esc(l.label)}</td><td class="num">${l.quantity}</td><td class="num">${fmt(l.priceUnit)}</td>
        <td class="num">${l.discount ? `${l.discount}%` : ''}</td><td>${esc(tx)}</td><td class="num">${fmt(totals.lines[i].untaxed)}</td></tr>`;
    })
    .join('');
  const taxRows = totals.byTax
    .map((t) => `<tr><td>${esc(taxes.get(t.taxId)?.label || taxes.get(t.taxId)?.name)}</td><td class="num">${fmt(t.amount)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
    <div class="header">${companyBlock(s)}${partnerBlock(partner)}</div>
    <h1>${esc(title)}</h1>
    <div class="meta">
      <div><b>Invoice Date</b>${formatDate(move.invoiceDate ?? move.date)}</div>
      ${move.dueDate ? `<div><b>Due Date</b>${formatDate(move.dueDate)}</div>` : ''}
      ${move.ref ? `<div><b>Reference</b>${esc(move.ref)}</div>` : ''}
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Disc.</th><th>Taxes</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Untaxed Amount</td><td class="num">${fmt(totals.untaxed)}</td></tr>
      ${taxRows}
      <tr class="grand"><td>Total</td><td class="num">${esc(s.settings.currencySymbol)} ${fmt(totals.total)}</td></tr>
      ${move.state === 'posted' ? `<tr><td>Amount Due</td><td class="num">${esc(s.settings.currencySymbol)} ${fmt(st.residual)}</td></tr>` : ''}
    </table>
    ${move.narration ? `<h2>Terms & Notes</h2><div>${esc(move.narration).replace(/\n/g, '<br/>')}</div>` : ''}
    ${move.state === 'posted' && move.moveType === 'out_invoice' ? `<p class="muted">Please use <b>${esc(move.name)}</b> as the payment reference.</p>` : ''}
    <div class="footer">${esc(s.settings.invoiceFooter)}</div>
  </body></html>`;
}

export function statementHtml(s: AppState, partner: Partner, items: { move: Move; residual: number; days: number; due?: string }[]): string {
  const d = s.settings.decimals;
  const fmt = (v: number) => formatAmount(v, d);
  const total = items.reduce((x, i) => x + i.residual, 0);
  const overdue = items.filter((i) => i.days > 0).reduce((x, i) => x + i.residual, 0);
  const rows = items
    .map((i) => `<tr><td>${esc(i.move.name)}</td><td>${formatDate(i.move.date)}</td><td>${formatDate(i.due)}</td><td class="num">${i.days > 0 ? i.days : ''}</td><td class="num">${fmt(i.residual)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
    <div class="header">${companyBlock(s)}${partnerBlock(partner)}</div>
    <h1>Payment Reminder</h1>
    <p>Dear ${esc(partner.name)},</p>
    <p>Our records indicate that the following amounts are still due. If you have already paid, please disregard this message.
    Otherwise, please send us the total amount stated below.</p>
    <table><thead><tr><th>Reference</th><th>Date</th><th>Due Date</th><th class="num">Days Late</th><th class="num">Amount Due</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      <tr><td>Total Overdue</td><td class="num">${fmt(overdue)}</td></tr>
      <tr class="grand"><td>Total Due</td><td class="num">${esc(s.settings.currencySymbol)} ${fmt(total)}</td></tr>
    </table>
    <p class="muted">Statement date: ${formatDate(today())}</p>
    <div class="footer">${esc(s.settings.invoiceFooter)}</div>
  </body></html>`;
}

export interface TableReport {
  title: string;
  subtitle: string;
  columns: string[];
  rows: { cells: (string | number)[]; level?: number; bold?: boolean }[];
}

export function reportHtml(s: AppState, r: TableReport): string {
  const d = s.settings.decimals;
  const cell = (v: string | number, i: number) => (typeof v === 'number' ? `<td class="num">${formatAmount(v, d)}</td>` : `<td${i > 0 ? ' class="num"' : ''}>${esc(v)}</td>`);
  const rows = r.rows.map((row) => `<tr class="${row.bold ? 'bold' : ''} l${row.level ?? 0}">${row.cells.map(cell).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
    <div class="header">${companyBlock(s)}<div class="muted" style="text-align:right">${esc(r.subtitle)}<br/>Currency: ${esc(s.settings.currency)}</div></div>
    <h1>${esc(r.title)}</h1>
    <table><thead><tr>${r.columns.map((c, i) => `<th${i > 0 ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="footer">Generated by Hisab on ${formatDate(today())}</div>
  </body></html>`;
}
