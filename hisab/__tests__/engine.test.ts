import {
  applyOutstanding,
  cancelPayment,
  invoiceStatus,
  newInvoiceLine,
  newMove,
  outstandingForInvoice,
  postMove,
  reconcileStatementLine,
  registerPayment,
  resetToDraft,
  reverseMove,
  saveDraft,
  saveStatementLine,
  suggestMatches,
  undoStatementReconciliation,
} from '../src/domain/engine';
import { depreciationBoard, postDepreciations } from '../src/domain/assets';
import { agedBalance, balanceSheet, dashboard, postTaxClosing, profitAndLoss, taxReport, trialBalance } from '../src/domain/reports';
import { createDemoCompany } from '../src/domain/seed';
import { computeLine } from '../src/domain/tax';
import { createCompany } from '../src/domain/template';
import { AppState, Partner } from '../src/domain/types';
import { byId, fiscalYear, newId } from '../src/domain/utils';

function setup() {
  let s = createCompany({ companyName: 'Test Co', currency: 'SAR', vatRate: 15 });
  const customer: Partner = { id: newId(), name: 'Customer A', email: '', phone: '', street: '', city: '', country: '', taxId: '', isCustomer: true, isVendor: false, notes: '', active: true };
  const vendor: Partner = { ...customer, id: newId(), name: 'Vendor B', isCustomer: false, isVendor: true };
  s = { ...s, partners: [customer, vendor] };
  return { s, customer, vendor };
}

function invoice(s: AppState, partnerId: string, price: number, type: 'out_invoice' | 'in_invoice' = 'out_invoice', date = '2026-03-10') {
  const taxId = type === 'out_invoice' ? s.settings.defaultSaleTaxId! : s.settings.defaultPurchaseTaxId!;
  let mv = newMove(s, type, { partnerId, date, invoiceDate: date });
  mv = { ...mv, invoiceLines: [newInvoiceLine({ label: 'Item', quantity: 2, priceUnit: price / 2, taxIds: [taxId] })] };
  s = postMove(saveDraft(s, mv), mv.id);
  return { s, id: mv.id };
}

describe('taxes', () => {
  it('computes excluded and included taxes', () => {
    const { s } = setup();
    const taxes = byId(s.taxes);
    const excl = s.taxes.find((t) => t.typeTaxUse === 'sale' && !t.priceInclude && t.amount === 15)!;
    const incl = s.taxes.find((t) => t.priceInclude)!;
    expect(computeLine({ quantity: 3, priceUnit: 100, discount: 10, taxIds: [excl.id] }, taxes, 2)).toMatchObject({ untaxed: 270, total: 310.5 });
    const r = computeLine({ quantity: 1, priceUnit: 115, discount: 0, taxIds: [incl.id] }, taxes, 2);
    expect(r.untaxed).toBe(100);
    expect(r.total).toBe(115);
  });
});

describe('invoicing', () => {
  it('posts a balanced invoice with a sequence number', () => {
    const { s: s0, customer } = setup();
    const { s, id } = invoice(s0, customer.id, 1000);
    const mv = s.moves.find((m) => m.id === id)!;
    expect(mv.name).toBe('INV/2026/00001');
    expect(mv.state).toBe('posted');
    const debit = mv.lines.reduce((x, l) => x + l.debit, 0);
    const credit = mv.lines.reduce((x, l) => x + l.credit, 0);
    expect(debit).toBe(1150);
    expect(credit).toBe(1150);
    expect(invoiceStatus(s, mv)).toMatchObject({ total: 1150, residual: 1150, paymentState: 'not_paid' });
  });

  it('refuses unbalanced journal entries and locked dates', () => {
    const { s } = setup();
    const acc = s.accounts[0].id;
    let mv = newMove(s, 'entry', { date: '2026-01-01' });
    mv = { ...mv, lines: [{ id: newId(), accountId: acc, label: '', debit: 10, credit: 0, kind: 'other' }] };
    expect(() => postMove(saveDraft(s, mv), mv.id)).toThrow(/not balanced/);
    const locked = { ...s, settings: { ...s.settings, lockDate: '2026-06-30' } };
    const { customer } = setup();
    expect(() => invoice({ ...locked, partners: [customer] }, customer.id, 100)).toThrow(/lock date/);
  });

  it('registers partial and full payments', () => {
    const { s: s0, customer } = setup();
    let { s, id } = invoice(s0, customer.id, 1000);
    const bank = s.journals.find((j) => j.type === 'bank')!;
    s = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 150, date: '2026-03-12', journalId: bank.id, memo: '', moveIds: [id] }).state;
    expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!)).toMatchObject({ residual: 1000, paymentState: 'partial' });
    const pay = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 1000, date: '2026-03-13', journalId: bank.id, memo: '', moveIds: [id] });
    s = pay.state;
    expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!)).toMatchObject({ residual: 0, paymentState: 'in_payment' });

    // Bank statement matches the outstanding payment => paid
    const sl = { id: newId(), journalId: bank.id, date: '2026-03-14', label: 'Customer A', amount: 1150, ref: '', reconciled: false };
    s = saveStatementLine(s, sl);
    const suggestions = suggestMatches(s, sl).filter((o) => o.move.origin === 'payment');
    expect(suggestions).toHaveLength(2);
    s = reconcileStatementLine(s, sl.id, suggestions.map((o) => o.line.id));
    expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!).paymentState).toBe('paid');
    expect(() => cancelPayment(s, pay.payment.id)).toThrow(/bank statement/);
    s = undoStatementReconciliation(s, sl.id);
    s = cancelPayment(s, pay.payment.id);
    expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!)).toMatchObject({ residual: 1000, paymentState: 'partial' });
  });

  it('applies outstanding customer credits', () => {
    const { s: s0, customer } = setup();
    const bank = s0.journals.find((j) => j.type === 'bank')!;
    let s = registerPayment(s0, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 500, date: '2026-03-01', journalId: bank.id, memo: 'Advance' }).state;
    const r = invoice(s, customer.id, 1000);
    s = r.s;
    const mv = s.moves.find((m) => m.id === r.id)!;
    const credits = outstandingForInvoice(s, mv);
    expect(credits).toHaveLength(1);
    s = applyOutstanding(s, mv.id, credits[0].line.id);
    expect(invoiceStatus(s, s.moves.find((m) => m.id === r.id)!).residual).toBe(650);
  });

  it('creates a full credit note that reverses the invoice', () => {
    const { s: s0, customer } = setup();
    let { s, id } = invoice(s0, customer.id, 200);
    const res = reverseMove(s, id, { date: '2026-03-20', reason: 'Damaged', post: true });
    s = res.state;
    expect(res.move.moveType).toBe('out_refund');
    expect(s.moves.find((m) => m.id === res.move.id)!.name).toBe('RINV/2026/00001');
    expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!).paymentState).toBe('reversed');
  });

  it('reset to draft removes reconciliation', () => {
    const { s: s0, customer } = setup();
    let { s, id } = invoice(s0, customer.id, 100);
    const bank = s.journals.find((j) => j.type === 'bank')!;
    s = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 115, date: '2026-03-12', journalId: bank.id, memo: '', moveIds: [id] }).state;
    s = resetToDraft(s, id);
    expect(s.reconciles).toHaveLength(0);
    s = postMove(s, id);
    expect(s.moves.find((m) => m.id === id)!.name).toBe('INV/2026/00001');
  });
});

describe('bank reconciliation', () => {
  it('books a write-off with tax', () => {
    const { s: s0 } = setup();
    const bank = s0.journals.find((j) => j.type === 'bank')!;
    const fees = s0.accounts.find((a) => a.code === '614000')!;
    const sl = { id: newId(), journalId: bank.id, date: '2026-03-14', label: 'Fees', amount: -115, ref: '', reconciled: false };
    let s = saveStatementLine(s0, sl);
    expect(() => reconcileStatementLine(s, sl.id, [])).toThrow(/unexplained/);
    s = reconcileStatementLine(s, sl.id, [], { accountId: fees.id, label: 'Bank fees', taxId: s.settings.defaultPurchaseTaxId });
    const tr = taxReport(s, '2026-03-01', '2026-03-31');
    expect(tr.purchases[0]).toMatchObject({ base: 100, amount: 15 });
  });
});

describe('reports', () => {
  it('balance sheet balances and P&L matches', () => {
    const { s: s0, customer, vendor } = setup();
    let { s } = invoice(s0, customer.id, 1000);
    s = invoice(s, vendor.id, 400, 'in_invoice').s;
    const pl = profitAndLoss(s, '2026-01-01', '2026-12-31');
    expect(pl.revenue).toBe(1000);
    expect(pl.netProfit).toBe(600);
    const bs = balanceSheet(s, '2026-12-31');
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity, 2);
    expect(bs.totalAssets).toBe(1150 + 60);
    const tb = trialBalance(s, '2026-01-01', '2026-12-31');
    expect(tb.totals.debit).toBe(tb.totals.credit);
    const tr = taxReport(s, '2026-01-01', '2026-12-31');
    expect(tr.net).toBe(90);
    s = postTaxClosing(s, '2026-01-01', '2026-03-31');
    const settle = s.accounts.find((a) => a.id === s.settings.taxSettlementAccountId)!;
    const row = trialBalance(s, '2026-01-01', '2026-12-31').rows.find((r) => r.account.id === settle.id)!;
    expect(row.end).toBe(-90);
    expect(s.settings.taxLockDate).toBe('2026-03-31');
  });

  it('ages receivables', () => {
    const { s: s0, customer } = setup();
    const { s } = invoice(s0, customer.id, 100, 'out_invoice', '2026-01-01');
    const aged = agedBalance(s, 'receivable', '2026-03-15');
    expect(aged.total).toBe(115);
    expect(aged.totals[2]).toBe(115); // due 2026-01-31 → 43 days late
  });

  it('computes fiscal years', () => {
    expect(fiscalYear('2026-05-01', 12)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalYear('2026-05-01', 3)).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(fiscalYear('2026-02-01', 3)).toEqual({ start: '2025-04-01', end: '2026-03-31' });
  });
});

describe('assets', () => {
  it('builds a linear board and posts depreciation', () => {
    const { s: s0 } = setup();
    const acc = (c: string) => s0.accounts.find((a) => a.code === c)!.id;
    const asset = { id: newId(), name: 'Laptop', acquisitionDate: '2026-01-01', firstDepreciationDate: '2026-01-01', originalValue: 1000, salvageValue: 0, durationMonths: 3, assetAccountId: acc('151000'), depreciationAccountId: acc('151100'), expenseAccountId: acc('620000'), journalId: s0.journals.find((j) => j.type === 'general')!.id, state: 'running' as const, depreciationMoveIds: [], notes: '' };
    const board = depreciationBoard(asset, 2);
    expect(board.map((r) => r.amount)).toEqual([333.33, 333.33, 333.34]);
    let s: AppState = { ...s0, assets: [asset] };
    s = postDepreciations(s, asset.id, '2026-02-28');
    expect(s.assets[0].depreciationMoveIds).toHaveLength(2);
    s = postDepreciations(s, asset.id, '2026-12-31');
    expect(s.assets[0].state).toBe('closed');
  });
});

describe('demo company', () => {
  it('is consistent', () => {
    const s = createDemoCompany();
    const bs = balanceSheet(s, '2099-12-31');
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity, 2);
    const d = dashboard(s);
    expect(d.cards.length).toBe(5);
    expect(d.receivable).toBeGreaterThan(0);
  });
});
