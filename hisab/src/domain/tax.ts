import { ID, InvoiceLine, Tax } from './types';
import { round } from './utils';

export interface TaxDetail {
  taxId: ID;
  base: number;
  amount: number;
  /** Self-assessed (reverse charge): booked as input and output VAT, not added to the total. */
  reverseCharge?: boolean;
}

export interface LineTotals {
  untaxed: number;
  taxes: TaxDetail[];
  total: number;
}

/**
 * Compute a single invoice line. Taxes are not cascading: every tax applies on the
 * untaxed amount. Price-included taxes are extracted from the line amount first.
 * Amounts are rounded per line (Odoo's default "round per line" method).
 */
export function computeLine(
  line: Pick<InvoiceLine, 'quantity' | 'priceUnit' | 'discount' | 'taxIds'>,
  taxesById: Map<ID, Tax>,
  decimals: number,
): LineTotals {
  const gross = line.quantity * line.priceUnit * (1 - (line.discount || 0) / 100);
  const taxes = line.taxIds.map((id) => taxesById.get(id)).filter((t): t is Tax => !!t);

  let includedPct = 0;
  let includedFixed = 0;
  for (const t of taxes) {
    if (!t.priceInclude || t.reverseCharge) continue;
    if (t.amountType === 'percent') includedPct += t.amount;
    else includedFixed += t.amount * line.quantity;
  }
  const untaxed = round((gross - includedFixed) / (1 + includedPct / 100), decimals);

  const details: TaxDetail[] = taxes.map((t) => ({
    taxId: t.id,
    base: untaxed,
    amount: round(t.amountType === 'percent' ? (untaxed * t.amount) / 100 : t.amount * line.quantity, decimals),
    reverseCharge: t.reverseCharge || undefined,
  }));

  // Make sure included taxes add back up to the gross amount exactly.
  if (includedPct > 0 || includedFixed > 0) {
    const included = details.filter((d) => taxesById.get(d.taxId)?.priceInclude && !d.reverseCharge);
    const diff = round(gross - untaxed - included.reduce((s, d) => s + d.amount, 0), decimals);
    if (diff !== 0 && included.length) included[included.length - 1].amount = round(included[included.length - 1].amount + diff, decimals);
  }

  const total = round(untaxed + details.reduce((s, d) => s + (d.reverseCharge ? 0 : d.amount), 0), decimals);
  return { untaxed, taxes: details, total };
}

export interface InvoiceTotals {
  untaxed: number;
  tax: number;
  total: number;
  /** Tax amounts grouped by tax. */
  byTax: TaxDetail[];
  lines: LineTotals[];
}

export function computeInvoiceTotals(lines: InvoiceLine[], taxesById: Map<ID, Tax>, decimals: number): InvoiceTotals {
  const lineTotals = lines.map((l) => computeLine(l, taxesById, decimals));
  const grouped = new Map<ID, TaxDetail>();
  for (const lt of lineTotals) {
    for (const d of lt.taxes) {
      const g = grouped.get(d.taxId) ?? { taxId: d.taxId, base: 0, amount: 0, reverseCharge: d.reverseCharge };
      g.base = round(g.base + d.base, decimals);
      g.amount = round(g.amount + d.amount, decimals);
      grouped.set(d.taxId, g);
    }
  }
  const untaxed = round(lineTotals.reduce((s, l) => s + l.untaxed, 0), decimals);
  const tax = round([...grouped.values()].reduce((s, g) => s + (g.reverseCharge ? 0 : g.amount), 0), decimals);
  return { untaxed, tax, total: round(untaxed + tax, decimals), byTax: [...grouped.values()], lines: lineTotals };
}
