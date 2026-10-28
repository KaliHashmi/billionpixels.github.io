import { bounceCheque, cancelPayment, chequeStatus, clearCheque, invoiceStatus, newInvoiceLine, newMove, postMove, reconcileStatementLine, registerPayment, saveDraft, saveStatementLine, suggestMatches, unclearCheque } from '../src/domain/engine';
import { bankReconciliation, budgetVsActual, cashPosition, chequeRegister, expenseReport, partnerOutstanding, payrollReport, pendingDocuments, unallocated, vatReturn } from '../src/domain/management';
import { closeCashDay, daySummary, monthsInPeriod, newPayrollRun, payPayroll, postPayroll, resetPayroll, savePayrollRun } from '../src/domain/operations';
import { balanceSheet, trialBalance } from '../src/domain/reports';
import { createDemoCompany } from '../src/domain/seed';
import { computeInvoiceTotals } from '../src/domain/tax';
import { createCompany, ensureCompanyDefaults } from '../src/domain/template';
import { AppState, Employee, Partner } from '../src/domain/types';
import { byId, newId } from '../src/domain/utils';

const D = '2026-03-10';

function oman() {
  let s = createCompany({ companyName: 'Muscat Co', currency: 'OMR', vatRate: 5, country: 'OM' });
  const customer: Partner = { id: newId(), name: 'Customer', email: '', phone: '', street: '', city: '', country: '', taxId: '', isCustomer: true, isVendor: false, notes: '', active: true };
  const vendor: Partner = { ...customer, id: newId(), name: 'Vendor', isCustomer: false, isVendor: true };
  s = { ...s, partners: [customer, vendor] };
  const bank = s.journals.find((j) => j.type === 'bank')!;
  const cash = s.journals.find((j) => j.type === 'cash')!;
  const acc = (c: string) => s.accounts.find((a) => a.code === c)!.id;
  return { s, customer, vendor, bank, cash, acc };
}

function invoice(s: AppState, partnerId: string, price: number, type: 'out_invoice' | 'in_invoice' = 'out_invoice', taxId?: string) {
  const tax = taxId ?? (type === 'out_invoice' ? s.settings.defaultSaleTaxId! : s.settings.defaultPurchaseTaxId!);
  let mv = newMove(s, type, { partnerId, date: D, invoiceDate: D });
  mv = { ...mv, invoiceLines: [newInvoiceLine({ label: 'Item', quantity: 1, priceUnit: price, taxIds: [tax] })] };
  return { s: postMove(saveDraft(s, mv), mv.id), id: mv.id };
}

it('uses OMR with 3 decimals and 5% VAT', () => {
  const { s } = oman();
  expect(s.settings.decimals).toBe(3);
  const r = invoice(s, s.partners[0].id, 100.123);
  expect(invoiceStatus(r.s, r.s.moves.find((m) => m.id === r.id)!).total).toBe(105.129);
});

it('reverse charge books input and output VAT without changing the bill total', () => {
  const { s: s0, vendor } = oman();
  const rc = s0.taxes.find((t) => t.vatCategory === 'reverse_charge')!;
  const totals = computeInvoiceTotals([newInvoiceLine({ quantity: 1, priceUnit: 200, taxIds: [rc.id] })], byId(s0.taxes), 3);
  expect(totals.total).toBe(200);
  const { s } = invoice(s0, vendor.id, 200, 'in_invoice', rc.id);
  const v = vatReturn(s, '2026-01-01', '2026-12-31');
  expect(v.supplies.find((l) => l.key === 'reverse_charge_due')).toMatchObject({ base: 200, vat: 10 });
  expect(v.purchases.find((l) => l.key === 'reverse_charge')).toMatchObject({ base: 200, vat: 10 });
  expect(v.net).toBe(0);
});

it('vat return groups supplies by treatment', () => {
  const { s: s0, customer, vendor } = oman();
  const zero = s0.taxes.find((t) => t.vatCategory === 'zero' && t.typeTaxUse === 'sale')!;
  const exempt = s0.taxes.find((t) => t.vatCategory === 'exempt' && t.typeTaxUse === 'sale')!;
  let s = invoice(s0, customer.id, 1000).s;
  s = invoice(s, customer.id, 300, 'out_invoice', zero.id).s;
  s = invoice(s, customer.id, 50, 'out_invoice', exempt.id).s;
  s = invoice(s, vendor.id, 400, 'in_invoice').s;
  const v = vatReturn(s, '2026-01-01', '2026-12-31');
  expect(v.supplies.map((l) => [l.key, l.base, l.vat])).toEqual([
    ['standard', 1000, 50],
    ['zero', 300, 0],
    ['exempt', 50, 0],
  ]);
  expect(v.inputVat).toBe(20);
  expect(v.net).toBe(30);
});

it('cheques stay pending until cleared, and bounce reopens the invoice', () => {
  const { s: s0, customer, bank } = oman();
  let { s, id } = invoice(s0, customer.id, 100);
  const pay = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 105, date: D, journalId: bank.id, memo: '', method: 'cheque', chequeNumber: '123', moveIds: [id] });
  s = pay.state;
  expect(pay.payment.name).toBe('RV/2026/00001');
  expect(chequeStatus(s, pay.payment)).toBe('pending');
  expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!).paymentState).toBe('in_payment');
  expect(chequeRegister(s)).toHaveLength(1);
  s = clearCheque(s, pay.payment.id, '2026-03-12');
  expect(chequeStatus(s, s.payments[0])).toBe('cleared');
  expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!).paymentState).toBe('paid');
  expect(() => bounceCheque(s, pay.payment.id)).toThrow(/Undo the clearance/);
  s = unclearCheque(s, pay.payment.id);
  s = bounceCheque(s, pay.payment.id);
  expect(chequeStatus(s, s.payments[0])).toBe('bounced');
  expect(invoiceStatus(s, s.moves.find((m) => m.id === id)!).paymentState).toBe('not_paid');
});

it('issued cheques can be matched with the bank statement', () => {
  const { s: s0, vendor, bank } = oman();
  let { s, id } = invoice(s0, vendor.id, 200, 'in_invoice');
  const pay = registerPayment(s, { paymentType: 'outbound', partnerType: 'supplier', partnerId: vendor.id, amount: 210, date: D, journalId: bank.id, memo: '', method: 'cheque', chequeNumber: '555', moveIds: [id] });
  s = pay.state;
  expect(pay.payment.name).toBe('PV/2026/00001');
  const sl = { id: newId(), journalId: bank.id, date: '2026-03-15', label: 'CHQ 555', amount: -210, ref: '', reconciled: false };
  s = saveStatementLine(s, sl);
  const match = suggestMatches(s, sl)[0];
  expect(match.move.id).toBe(pay.payment.moveId);
  s = reconcileStatementLine(s, sl.id, [match.line.id]);
  expect(chequeStatus(s, s.payments[0])).toBe('cleared');
  expect(() => cancelPayment(s, pay.payment.id)).toThrow(/cleared or matched/);
});

it('records direct cash expenses with VAT and closes the cash day', () => {
  const { s: s0, cash, acc } = oman();
  let s = registerPayment(s0, { paymentType: 'inbound', partnerType: 'other', amount: 100, date: D, journalId: cash.id, memo: 'Capital', counterpartAccountId: acc('301000') }).state;
  s = registerPayment(s, { paymentType: 'outbound', partnerType: 'other', amount: 21, date: D, journalId: cash.id, memo: 'Fuel', counterpartAccountId: acc('618000'), taxId: s.settings.defaultPurchaseTaxId }).state;
  const tb = trialBalance(s, '2026-01-01', '2026-12-31');
  expect(tb.rows.find((r) => r.account.code === '618000')!.end).toBe(20);
  expect(tb.rows.find((r) => r.account.code === '131000')!.end).toBe(1);
  const sum = daySummary(s, cash.id, D);
  expect(sum.expectedCash).toBe(79);
  s = closeCashDay(s, { date: D, journalId: cash.id, counted: 78.5, cardSettled: 0, notes: '' });
  expect(s.cashClosings[0].difference).toBe(-0.5);
  expect(trialBalance(s, '2026-01-01', '2026-12-31').rows.find((r) => r.account.code === '617000')!.end).toBe(0.5);
  expect(() => closeCashDay(s, { date: D, journalId: cash.id, counted: 78.5, cardSettled: 0, notes: '' })).toThrow(/already closed/);
});

it('card receipts wait in the clearing account until settlement', () => {
  const { s: s0, customer, bank } = oman();
  let s = registerPayment(s0, { paymentType: 'inbound', partnerType: 'customer', partnerId: customer.id, amount: 50, date: D, journalId: bank.id, memo: '', method: 'card' }).state;
  expect(cashPosition(s, D).inTransit.find((i) => i.label.startsWith('Card'))!.amount).toBe(50);
  expect(unallocated(s)).toHaveLength(1);
  const sl = { id: newId(), journalId: bank.id, date: D, label: 'POS SETTLEMENT', amount: 49, ref: '', reconciled: false };
  s = saveStatementLine(s, sl);
  const fees = s.accounts.find((a) => a.code === '614000')!;
  s = reconcileStatementLine(s, sl.id, [suggestMatches(s, sl)[0].line.id], { accountId: fees.id, label: 'Card fee' }, true);
  expect(trialBalance(s, '2026-01-01', '2026-12-31').rows.find((r) => r.account.code === '614000')!.end).toBe(1);
  expect(cashPosition(s, D).inTransit.find((i) => i.label.startsWith('Card'))!.amount).toBe(0);
  const brs = bankReconciliation(s, bank.id, D);
  expect(brs.difference).toBe(0);
});

it('runs payroll with social insurance for Omani staff only', () => {
  const { s: s0, bank } = oman();
  const emp = (p: Partial<Employee>): Employee => ({ id: newId(), name: 'E', code: '', position: '', nationality: 'omani', basicSalary: 1000, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0, socialInsurance: true, bankName: '', iban: '', joinDate: D, active: true, ...p });
  let s: AppState = { ...s0, employees: [emp({ name: 'Omani' }), emp({ name: 'Expat', nationality: 'expat', socialInsurance: false, basicSalary: 500 })] };
  const run = newPayrollRun(s, '2026-03');
  expect(run.payslips[0]).toMatchObject({ siEmployee: 80, siEmployer: 125, net: 920 });
  expect(run.payslips[1]).toMatchObject({ siEmployee: 0, net: 500 });
  s = postPayroll(savePayrollRun(s, run), run.id);
  s = payPayroll(s, run.id, bank.id, '2026-03-31');
  const tb = trialBalance(s, '2026-01-01', '2026-12-31');
  expect(tb.totals.debit).toBe(tb.totals.credit);
  expect(tb.rows.find((r) => r.account.code === '611000')!.end).toBe(1500);
  expect(tb.rows.find((r) => r.account.code === '230100')!.end).toBe(-205);
  expect(tb.rows.find((r) => r.account.code === '230000')!.end).toBe(0);
  expect(payrollReport(s, '2026-03-01', '2026-03-31').totals.net).toBe(1420);
  s = resetPayroll(s, run.id);
  expect(s.moves.filter((m) => m.origin === 'payroll')).toHaveLength(0);
});

it('compares budget and actual', () => {
  const { s: s0, vendor, acc } = oman();
  let s = invoice(s0, vendor.id, 700, 'in_invoice').s;
  const expense = s.journals.find((j) => j.type === 'purchase')!.defaultAccountId!;
  s = { ...s, budgets: [{ id: 'b', name: 'B', active: true, lines: [{ accountId: expense, monthly: 250 }, { accountId: acc('401000'), monthly: 1000 }] }] };
  expect(monthsInPeriod('2026-01-01', '2026-03-31')).toBe(3);
  const r = budgetVsActual(s, 'b', '2026-01-01', '2026-03-31');
  expect(r.rows.find((x) => x.account.id === expense)).toMatchObject({ budget: 750, actual: 700, variance: -50 });
  expect(r.income.budget).toBe(3000);
  const e = expenseReport(s, '2026-03-01', '2026-03-31', '2026-02-01', '2026-02-28');
  expect(e.total).toBe(700);
});

it('lists pending collections and outstanding balances', () => {
  const { s: s0, customer } = oman();
  const { s } = invoice(s0, customer.id, 100);
  expect(pendingDocuments(s, 'customer', '2026-04-20', '2026-04-27')).toHaveLength(1);
  expect(partnerOutstanding(s, 'receivable', '2026-04-20').overdue).toBe(105);
});

it('upgrades books saved by the first version', () => {
  const { s } = oman();
  const old = {
    ...s,
    accounts: s.accounts.filter((a) => !['101405', '201100', '611100'].includes(a.code)),
    settings: { ...s.settings, chequesReceivedAccountId: undefined, chequesIssuedAccountId: undefined, siExpenseAccountId: undefined },
    taxes: s.taxes.map((t) => ({ ...t, vatCategory: undefined })),
  } as unknown as AppState;
  const up = ensureCompanyDefaults(old);
  expect(up.accounts.find((a) => a.code === '101405')!.id).toBe(up.settings.chequesReceivedAccountId);
  expect(up.taxes.every((t) => t.vatCategory)).toBe(true);
  expect(ensureCompanyDefaults(up)).toBe(up);
});

it('demo company balances', () => {
  const s = createDemoCompany();
  const bs = balanceSheet(s, '2099-12-31');
  expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity, 3);
  expect(chequeRegister(s).length).toBe(2);
  expect(s.payrollRuns.every((r) => r.state === 'paid')).toBe(true);
  const bank = s.journals.find((j) => j.type === 'bank')!;
  const brs = bankReconciliation(s, bank.id, '2099-12-31');
  expect(brs.difference).toBe(0);
  expect(brs.unrecordedInBooks).toHaveLength(2);
  expect(brs.unpresentedPayments).toHaveLength(0);
});

import { amountInWords } from '../src/domain/words';

it('writes amounts in words', () => {
  expect(amountInWords(1250.5, 'OMR', 'en')).toBe('One Thousand Two Hundred and Fifty Omani Rials and Five Hundred Baisa Only');
  expect(amountInWords(1250.5, 'OMR', 'ar')).toBe('فقط ألف ومائتان وخمسون ريال عماني وخمسمائة بيسة لا غير');
  expect(amountInWords(3021, 'OMR', 'ar')).toBe('فقط ثلاثة آلاف وواحد وعشرون ريال عماني لا غير');
  expect(amountInWords(105.129, 'OMR', 'en')).toBe('One Hundred and Five Omani Rials and One Hundred and Twenty-Nine Baisa Only');
});

it('lists unpaid salary transfers as unpresented in the bank reconciliation', () => {
  const { s: s0, bank } = oman();
  const emp: Employee = { id: newId(), name: 'E', code: '', position: '', nationality: 'expat', basicSalary: 400, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0, socialInsurance: false, bankName: '', iban: '', joinDate: D, active: true };
  let s: AppState = { ...s0, employees: [emp] };
  const run = newPayrollRun(s, '2026-03');
  s = payPayroll(postPayroll(savePayrollRun(s, run), run.id), run.id, bank.id, '2026-03-31');
  const brs = bankReconciliation(s, bank.id, '2026-04-30');
  expect(brs.unpresentedPayments.map((u) => u.amount)).toEqual([400]);
  expect(brs.projectedBalance).toBe(-400);
});
