import { diffStates, migrate } from '../src/data/persistence';
import {
  bounceCheque,
  buildReconcileIndex,
  cancelPayment,
  chequeStatus,
  clearCheque,
  invoiceStatus,
  isInvoice,
  lineResidual,
  newInvoiceLine,
  newMove,
  outstandingForInvoice,
  applyOutstanding,
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
import { bankReconciliation, cashPosition, partnerOutstanding, unallocated, vatReturn } from '../src/domain/management';
import { closeCashDay, newPayrollRun, payPayroll, postPayroll, savePayrollRun } from '../src/domain/operations';
import { agedBalance, balanceSheet, dashboard, profitAndLoss, trialBalance } from '../src/domain/reports';
import { createDemoCompany } from '../src/domain/seed';
import { AccountingError, AppState, MoveType, PaymentMethod } from '../src/domain/types';
import { addDays, isZero, newId, round, today } from '../src/domain/utils';

/** Deterministic pseudo-random generator so failures are reproducible. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function checkInvariants(s: AppState, step: string) {
  const d = s.settings.decimals;
  for (const m of s.moves) {
    if (m.state !== 'posted') continue;
    const dr = m.lines.reduce((a, l) => a + l.debit, 0);
    const cr = m.lines.reduce((a, l) => a + l.credit, 0);
    if (!isZero(dr - cr, d)) throw new Error(`${step}: unbalanced ${m.name} ${dr} ${cr}`);
    for (const l of m.lines) if (l.debit < 0 || l.credit < 0) throw new Error(`${step}: negative line in ${m.name}`);
  }
  const tb = trialBalance(s, '2000-01-01', '2099-12-31');
  if (!isZero(tb.totals.debit - tb.totals.credit, d)) throw new Error(`${step}: trial balance off`);
  const bs = balanceSheet(s, '2099-12-31');
  if (!isZero(bs.totalAssets - bs.totalLiabilities - bs.totalEquity, d)) throw new Error(`${step}: balance sheet off by ${bs.totalAssets - bs.totalLiabilities - bs.totalEquity}`);
  const idx = buildReconcileIndex(s.reconciles);
  const lines = new Map(s.moves.flatMap((m) => m.lines.map((l) => [l.id, { m, l }] as const)));
  for (const r of s.reconciles) {
    const a = lines.get(r.debitLineId);
    const b = lines.get(r.creditLineId);
    if (!a || !b) throw new Error(`${step}: dangling reconcile`);
    if (a.m.state !== 'posted' || b.m.state !== 'posted') throw new Error(`${step}: reconcile on unposted ${a.m.name}/${b.m.name}`);
    if (a.l.accountId !== b.l.accountId) throw new Error(`${step}: cross-account reconcile`);
    if (!(r.amount > 0)) throw new Error(`${step}: non-positive reconcile`);
  }
  for (const { l } of lines.values()) {
    const bal = l.debit - l.credit;
    const res = lineResidual(l, idx, d);
    if (Math.abs(res) > Math.abs(bal) + 1e-9 || (res !== 0 && Math.sign(res) !== Math.sign(bal))) throw new Error(`${step}: over-reconciled line ${l.label} bal ${bal} res ${res}`);
  }
  for (const m of s.moves) {
    if (m.state !== 'posted' || !isInvoice(m.moveType)) continue;
    const st = invoiceStatus(s, m, idx);
    if (st.residual < -1e-9 || st.residual > st.total + 1e-9) throw new Error(`${step}: bad residual on ${m.name}`);
  }
  // Every report must run without throwing.
  profitAndLoss(s, '2000-01-01', '2099-12-31');
  agedBalance(s, 'receivable', today());
  partnerOutstanding(s, 'payable', today());
  cashPosition(s, today());
  unallocated(s);
  vatReturn(s, '2000-01-01', '2099-12-31');
  dashboard(s);
  for (const j of s.journals.filter((x) => x.type === 'bank')) bankReconciliation(s, j.id, '2099-12-31');
}

/** Rebuild the state from the record-level writes, like the SQLite storage does. */
function replay(prev: Map<string, unknown>, meta: Map<string, unknown>, before: AppState | null, after: AppState) {
  const c = diffStates(before, after);
  for (const u of c.upserts) prev.set(`${u.collection}:${u.id}`, JSON.parse(JSON.stringify(u.data)));
  for (const x of c.deletes) prev.delete(`${x.collection}:${x.id}`);
  for (const m of c.meta) meta.set(m.key, JSON.parse(JSON.stringify(m.value)));
}

function rebuild(prev: Map<string, unknown>, meta: Map<string, unknown>): AppState {
  const st: Record<string, unknown> = { settings: meta.get('settings'), sequences: meta.get('sequences') };
  for (const [key, v] of prev) {
    const [col] = key.split(':');
    ((st[col] ??= []) as unknown[]).push(v);
  }
  return migrate(st as unknown as AppState);
}

const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

for (const seed of [1, 7, 42]) {
  it(`keeps the books consistent through random operations (seed ${seed})`, () => {
    const r = rng(seed);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    let s = createDemoCompany();
    const records = new Map<string, unknown>();
    const meta = new Map<string, unknown>();
    replay(records, meta, null, s);
    const bank = s.journals.find((j) => j.type === 'bank')!;
    const cash = s.journals.find((j) => j.type === 'cash')!;
    const customers = s.partners.filter((p) => p.isCustomer);
    const vendors = s.partners.filter((p) => p.isVendor);
    const counts: Record<string, number> = {};
    let errors = 0;

    for (let step = 0; step < 250; step++) {
      const before = s;
      const date = addDays(today(), -Math.floor(r() * 120));
      const op = pick(['invoice', 'invoice', 'bill', 'pay', 'pay', 'refund', 'reset', 'cancelPay', 'cheque', 'statement', 'undoStatement', 'outstanding', 'payroll', 'cashClose', 'other']);
      try {
        switch (op) {
          case 'invoice':
          case 'bill': {
            const type: MoveType = op === 'invoice' ? 'out_invoice' : 'in_invoice';
            const partner = pick(op === 'invoice' ? customers : vendors);
            const taxes = s.taxes.filter((t) => t.typeTaxUse === (op === 'invoice' ? 'sale' : 'purchase'));
            let mv = newMove(s, type, { partnerId: partner.id, date, invoiceDate: date });
            mv = {
              ...mv,
              invoiceLines: Array.from({ length: 1 + Math.floor(r() * 3) }, () =>
                newInvoiceLine({ label: 'x', quantity: 1 + Math.floor(r() * 5), priceUnit: round(r() * 500, 3), discount: r() < 0.2 ? 10 : 0, taxIds: [pick(taxes).id] }),
              ),
            };
            s = saveDraft(s, mv);
            if (r() < 0.85) s = postMove(s, mv.id);
            break;
          }
          case 'pay': {
            const open = s.moves.filter((m) => m.state === 'posted' && isInvoice(m.moveType) && invoiceStatus(s, m).residual > 0);
            if (!open.length) break;
            const inv = pick(open);
            const st = invoiceStatus(s, inv);
            const method: PaymentMethod = pick(['bank_transfer', 'cheque', 'card', 'cash']);
            const inbound = inv.moveType === 'out_invoice' || inv.moveType === 'in_refund';
            s = registerPayment(s, {
              paymentType: inbound ? 'inbound' : 'outbound',
              partnerType: inv.moveType.startsWith('out') ? 'customer' : 'supplier',
              partnerId: inv.partnerId,
              amount: round(r() < 0.6 ? st.residual : st.residual * r() + 0.001, 3),
              date: addDays(inv.date, Math.floor(r() * 30)),
              journalId: method === 'cash' ? cash.id : bank.id,
              memo: inv.name,
              method,
              chequeNumber: String(Math.floor(r() * 1e6)),
              moveIds: [inv.id],
            }).state;
            break;
          }
          case 'refund': {
            const posted = s.moves.filter((m) => m.state === 'posted' && (m.moveType === 'out_invoice' || m.moveType === 'in_invoice'));
            if (!posted.length) break;
            s = reverseMove(s, pick(posted).id, { date, reason: 'test', post: r() < 0.7 }).state;
            break;
          }
          case 'reset': {
            const posted = s.moves.filter((m) => m.state === 'posted' && m.origin === 'manual' && isInvoice(m.moveType));
            if (!posted.length) break;
            const m = pick(posted);
            s = resetToDraft(s, m.id);
            if (r() < 0.7) s = postMove(s, m.id);
            break;
          }
          case 'cancelPay': {
            const p = s.payments.filter((x) => x.state === 'posted');
            if (p.length) s = cancelPayment(s, pick(p).id);
            break;
          }
          case 'cheque': {
            const pending = s.payments.filter((p) => p.method === 'cheque' && chequeStatus(s, p) === 'pending');
            if (!pending.length) break;
            const p = pick(pending);
            s = r() < 0.75 ? clearCheque(s, p.id, addDays(p.date, 3)) : bounceCheque(s, p.id);
            break;
          }
          case 'statement': {
            const sl = { id: newId(), journalId: bank.id, date, label: 'TX', amount: round((r() - 0.5) * 2000, 3) || 1, ref: '', reconciled: false };
            s = saveStatementLine(s, sl);
            const matches = suggestMatches(s, sl).slice(0, Math.floor(r() * 3)).map((o) => o.line.id);
            const fees = s.accounts.find((a) => a.code === '614000')!;
            s = reconcileStatementLine(s, sl.id, matches, { accountId: fees.id, label: 'diff' }, r() < 0.5);
            break;
          }
          case 'undoStatement': {
            const done = s.statementLines.filter((l) => l.reconciled);
            if (done.length) s = undoStatementReconciliation(s, pick(done).id);
            break;
          }
          case 'outstanding': {
            const inv = s.moves.filter((m) => m.state === 'posted' && isInvoice(m.moveType) && invoiceStatus(s, m).residual > 0);
            for (const m of inv) {
              const credits = outstandingForInvoice(s, m);
              if (credits.length) {
                s = applyOutstanding(s, m.id, credits[0].line.id);
                break;
              }
            }
            break;
          }
          case 'payroll': {
            const month = date.slice(0, 7);
            if (s.payrollRuns.some((x) => x.month === month)) break;
            const run = newPayrollRun(s, month);
            s = postPayroll(savePayrollRun(s, run), run.id);
            if (r() < 0.8) s = payPayroll(s, run.id, bank.id, run.date);
            break;
          }
          case 'cashClose':
            s = closeCashDay(s, { date, journalId: cash.id, counted: round(r() * 1000, 3), cardSettled: 0, notes: '' });
            break;
          case 'other':
            s = registerPayment(s, {
              paymentType: r() < 0.5 ? 'inbound' : 'outbound',
              partnerType: 'other',
              amount: round(1 + r() * 100, 3),
              date,
              journalId: r() < 0.5 ? cash.id : bank.id,
              memo: 'misc',
              method: 'bank_transfer',
              counterpartAccountId: s.accounts.find((a) => a.code === '618000')!.id,
              taxId: r() < 0.5 ? s.settings.defaultPurchaseTaxId : undefined,
            }).state;
            break;
        }
        counts[op] = (counts[op] ?? 0) + 1;
      } catch (e) {
        // Business-rule refusals are fine (e.g. already closed day); anything else is a bug.
        if (!(e instanceof AccountingError)) throw new Error(`step ${step} ${op}: ${(e as Error).stack}`);
        errors++;
        s = before;
      }
      checkInvariants(s, `step ${step} (${op})`);
      replay(records, meta, before, s);
    }
    const reloaded = rebuild(records, meta);
    expect(sortById(reloaded.moves)).toEqual(sortById(s.moves));
    expect(sortById(reloaded.reconciles)).toEqual(sortById(s.reconciles));
    expect(sortById(reloaded.payments)).toEqual(sortById(s.payments));
    expect(reloaded.sequences).toEqual(s.sequences);
    expect(JSON.parse(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(migrate(JSON.parse(JSON.stringify(s))))));
    expect(Object.keys(counts).length).toBeGreaterThan(8);
    expect(errors).toBeLessThan(40);
  });
}
