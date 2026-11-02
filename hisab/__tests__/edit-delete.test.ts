import { canDeleteDocuments, canEdit, canEditDocuments } from '../src/domain/auth';
import {
  cancelIssuedMove,
  cancelPayment,
  correctInvoice,
  deleteMove,
  editPayment,
  invoiceStatus,
  newInvoiceLine,
  newMove,
  PaymentInput,
  postMove,
  reconcileStatementLine,
  registerPayment,
  resetToDraft,
  reverseMove,
  saveDraft,
  saveStatementLine,
} from '../src/domain/engine';
import { cancelPayrollRun, computePayslip, deletePayrollRun, newPayrollRun, payPayroll, postPayroll, savePayrollRun } from '../src/domain/operations';
import { postTaxClosing, trialBalance } from '../src/domain/reports';
import { createCompany } from '../src/domain/template';
import { AppState, Employee, MoveType, Partner } from '../src/domain/types';
import { newId } from '../src/domain/utils';
import { invoiceHtml } from '../src/services/documents';

// Oman record keeping: issued tax invoices, credit notes and the books are kept (10 years) and
// corrected only with credit notes or cancellations, never erased.

const D = '2026-03-10';

function books() {
  let s = createCompany({ companyName: 'Muscat Co', currency: 'OMR', vatRate: 5, country: 'OM' });
  const customer: Partner = { id: newId(), name: 'Customer', email: '', phone: '', street: '', city: '', country: '', taxId: '', isCustomer: true, isVendor: true, notes: '', active: true };
  s = { ...s, partners: [customer] };
  return { s, customer, bank: s.journals.find((j) => j.type === 'bank')! };
}

function doc(s: AppState, partnerId: string, price: number, type: MoveType = 'out_invoice') {
  let mv = newMove(s, type, { partnerId, date: D, invoiceDate: D });
  const tax = type.startsWith('out') ? s.settings.defaultSaleTaxId! : s.settings.defaultPurchaseTaxId!;
  mv = { ...mv, invoiceLines: [newInvoiceLine({ label: 'Item', quantity: 1, priceUnit: price, taxIds: [tax] })] };
  return { s: postMove(saveDraft(s, mv), mv.id), id: mv.id };
}

const receipt = (partnerId: string, journalId: string, amount: number, moveIds?: string[]): PaymentInput => ({
  paymentType: 'inbound',
  partnerType: 'customer',
  partnerId,
  amount,
  date: D,
  journalId,
  memo: 'r',
  method: 'bank_transfer',
  moveIds,
});

const balanced = (s: AppState) => {
  const tb = trialBalance(s, '2026-01-01', '2026-12-31').totals;
  expect(tb.debit).toBeCloseTo(tb.credit, 6);
};
const move = (s: AppState, id: string) => s.moves.find((m) => m.id === id)!;

describe('roles on issued documents', () => {
  it('lets administrators correct and cancel, accountants only cancel, viewers neither', () => {
    expect([canEditDocuments('admin'), canDeleteDocuments('admin'), canEdit('admin')]).toEqual([true, true, true]);
    expect([canEditDocuments('accountant'), canDeleteDocuments('accountant'), canEdit('accountant')]).toEqual([false, true, true]);
    expect([canEditDocuments('viewer'), canDeleteDocuments('viewer'), canEdit('viewer')]).toEqual([false, false, false]);
  });
});

describe('issued documents are never erased', () => {
  it('erases a draft that was never numbered, but refuses any numbered document', () => {
    const { s: s0, customer } = books();
    const draft = newMove(s0, 'out_invoice', { partnerId: customer.id, date: D });
    expect(deleteMove(saveDraft(s0, draft), draft.id).moves).toHaveLength(0);
    const { s, id } = doc(s0, customer.id, 100);
    expect(() => deleteMove(s, id)).toThrow(/10 years/);
  });

  it('refuses to put an issued tax invoice back to draft', () => {
    const { s: s0, customer } = books();
    const { s, id } = doc(s0, customer.id, 100);
    expect(() => resetToDraft(s, id)).toThrow(/credit note/);
    expect(() => cancelIssuedMove(s, id)).toThrow(/credit note/);
  });

  it('a tax credit note must give its reason, and is printed with it', () => {
    const { s: s0, customer } = books();
    const { s, id } = doc(s0, customer.id, 100);
    expect(() => reverseMove(s, id, { date: D, reason: ' ', post: true })).toThrow(/reason/);
    const credit = reverseMove(s, id, { date: D, reason: 'Damaged goods', post: true });
    expect(credit.move.reason).toBe('Damaged goods');
    const html = invoiceHtml(credit.state, credit.move);
    expect(html).toContain('TAX CREDIT NOTE');
    expect(html).toContain('Damaged goods');
    expect(html).toContain(move(s, id).name); // original invoice number
    expect(invoiceHtml(credit.state, move(credit.state, id))).toContain('CREDITED');
  });

  it('cancelling a paid invoice with a credit note keeps both and leaves the customer in credit', () => {
    const { s: s0, customer, bank } = books();
    const inv = doc(s0, customer.id, 100);
    const paid = registerPayment(inv.s, receipt(customer.id, bank.id, 105, [inv.id])).state;
    const credit = reverseMove(paid, inv.id, { date: D, reason: 'Order cancelled', post: true });
    expect(credit.state.moves.filter((m) => m.state === 'posted' && m.moveType.startsWith('out'))).toHaveLength(2);
    // The receipt stays matched with the invoice; the credit note is the customer's credit (refund or offset).
    expect(invoiceStatus(credit.state, credit.move).residual).toBe(105);
    balanced(credit.state);
  });

  it('correcting an invoice issues a credit note and a new draft with its own number', () => {
    const { s: s0, customer } = books();
    const inv = doc(s0, customer.id, 100);
    const res = correctInvoice(inv.s, inv.id, { date: D, reason: 'Wrong price' });
    expect(res.creditNote.state).toBe('posted');
    expect(res.creditNote.reversedEntryId).toBe(inv.id);
    expect(res.draft.state).toBe('draft');
    const fixed = { ...res.draft, invoiceLines: res.draft.invoiceLines.map((l) => ({ ...l, priceUnit: 120 })) };
    const s = postMove(saveDraft(res.state, fixed), fixed.id);
    expect(move(s, fixed.id).name).not.toBe(move(s, inv.id).name);
    expect(invoiceStatus(s, move(s, inv.id)).residual).toBe(0);
    expect(invoiceStatus(s, move(s, fixed.id)).total).toBe(126);
    balanced(s);
  });

  it('a bill can be corrected in place (it keeps its number) or cancelled and kept', () => {
    const { s: s0, customer } = books();
    const bill = doc(s0, customer.id, 200, 'in_invoice');
    const name = move(bill.s, bill.id).name;
    let s = resetToDraft(bill.s, bill.id);
    s = postMove(saveDraft(s, { ...move(s, bill.id), invoiceLines: move(s, bill.id).invoiceLines.map((l) => ({ ...l, priceUnit: 250 })) }), bill.id);
    expect(move(s, bill.id).name).toBe(name);
    s = cancelIssuedMove(s, bill.id);
    expect(move(s, bill.id).state).toBe('cancel');
    expect(trialBalance(s, '2026-01-01', '2026-12-31').totals.debit).toBe(0);
  });

  it('respects the lock date', () => {
    const { s: s0, customer } = books();
    const bill = doc(s0, customer.id, 100, 'in_invoice');
    const locked = { ...bill.s, settings: { ...bill.s.settings, lockDate: '2026-03-31' } };
    expect(() => cancelIssuedMove(locked, bill.id)).toThrow(/lock date/);
  });

  it('cancelling a VAT closing keeps it on record, reopens the period, and it can be closed again', () => {
    const { s: s0, customer } = books();
    let s = doc(s0, customer.id, 100).s;
    s = postTaxClosing(s, '2026-01-01', '2026-03-31');
    const closing = s.moves.find((m) => m.origin === 'tax_closing')!;
    s = cancelIssuedMove(s, closing.id);
    expect(move(s, closing.id).state).toBe('cancel');
    expect(s.settings.taxLockDate).toBeUndefined();
    s = postTaxClosing(doc(s, customer.id, 50).s, '2026-01-01', '2026-03-31');
    expect(s.moves.find((m) => m.origin === 'tax_closing' && m.state === 'posted')!.lines.find((l) => l.label === 'VAT payable')!.credit).toBe(7.5);
    balanced(s);
  });
});

describe('invoice content', () => {
  it('drafts are not titled tax invoice, and the date of supply is printed when it differs', () => {
    const { s, customer } = books();
    let mv = newMove(s, 'out_invoice', { partnerId: customer.id, date: D, invoiceDate: D, supplyDate: '2026-03-02' });
    mv = { ...mv, invoiceLines: [newInvoiceLine({ label: 'Item', quantity: 1, priceUnit: 10, taxIds: [s.settings.defaultSaleTaxId!] })] };
    const drafted = saveDraft(s, mv);
    const draftHtml = invoiceHtml(drafted, move(drafted, mv.id));
    expect(draftHtml).toContain('NOT A TAX DOCUMENT');
    expect(draftHtml).not.toContain('>TAX INVOICE<');
    const posted = postMove(drafted, mv.id);
    const html = invoiceHtml(posted, move(posted, mv.id));
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('Date of Supply');
    expect(() => postMove(saveDraft(s, { ...mv, id: newId(), supplyDate: '02/03/2026' }), mv.id)).toThrow();
  });
});

describe('vouchers', () => {
  it('cancelling a receipt keeps the voucher and makes the invoice due again', () => {
    const { s: s0, customer, bank } = books();
    const inv = doc(s0, customer.id, 100);
    const pay = registerPayment(inv.s, receipt(customer.id, bank.id, 105, [inv.id]));
    const s = cancelPayment(pay.state, pay.payment.id);
    expect(s.payments).toHaveLength(1);
    expect(s.payments[0].state).toBe('cancel');
    expect(invoiceStatus(s, move(s, inv.id)).residual).toBe(105);
    balanced(s);
  });

  it('refuses to cancel or edit a payment matched on a bank statement', () => {
    const { s: s0, customer, bank } = books();
    const pay = registerPayment(s0, receipt(customer.id, bank.id, 50));
    let s = saveStatementLine(pay.state, { id: 'sl', journalId: bank.id, date: D, label: 'in', amount: 50, ref: '', reconciled: false });
    const liquidity = move(s, pay.payment.moveId).lines.find((l) => l.kind === 'other')!;
    s = reconcileStatementLine(s, 'sl', [liquidity.id]);
    expect(() => cancelPayment(s, pay.payment.id)).toThrow(/bank statement/);
    expect(() => editPayment(s, pay.payment.id, receipt(customer.id, bank.id, 60))).toThrow(/bank reconciliation/);
  });

  it('editing keeps the voucher number and the invoices it paid', () => {
    const { s: s0, customer, bank } = books();
    const inv = doc(s0, customer.id, 100);
    const pay = registerPayment(inv.s, receipt(customer.id, bank.id, 105, [inv.id]));
    const res = editPayment(pay.state, pay.payment.id, { ...receipt(customer.id, bank.id, 60), date: '2026-03-15', memo: 'corrected' });
    expect(res.payment).toMatchObject({ id: pay.payment.id, name: pay.payment.name, moveId: pay.payment.moveId, amount: 60, memo: 'corrected' });
    expect(invoiceStatus(res.state, move(res.state, inv.id)).residual).toBe(45);
    balanced(res.state);
  });
});

describe('payroll', () => {
  const employee = (over: Partial<Employee> = {}): Employee => ({
    id: newId(), name: 'A', code: '', position: '', nationality: 'omani', basicSalary: 500, housingAllowance: 100, transportAllowance: 0, otherAllowance: 0,
    socialInsurance: true, bankName: '', iban: '', joinDate: D, active: true, ...over,
  });

  it('an issued payroll is cancelled and kept, with its entries cancelled; a draft can be erased', () => {
    let { s } = books();
    s = { ...s, employees: [employee()] };
    const draft = newPayrollRun(s, '2026-02');
    expect(deletePayrollRun(savePayrollRun(s, draft), draft.id).payrollRuns).toHaveLength(0);
    const run = newPayrollRun(s, '2026-03');
    s = payPayroll(postPayroll(savePayrollRun(s, run), run.id), run.id, s.journals.find((j) => j.type === 'bank')!.id, '2026-03-28');
    expect(() => deletePayrollRun(s, run.id)).toThrow(/wage record/);
    s = cancelPayrollRun(s, run.id);
    expect(s.payrollRuns[0].state).toBe('cancel');
    const entries = s.moves.filter((m) => m.origin === 'payroll');
    expect(entries.length).toBe(2);
    expect(entries.every((m) => m.state === 'cancel')).toBe(true);
    // The month can be run again.
    expect(() => newPayrollRun(s, '2026-03')).not.toThrow();
  });

  it('social insurance uses the Omani and expatriate rates and the wage ceiling', () => {
    const { s } = books();
    expect([s.settings.siEmployeeRate, s.settings.siEmployerRate, s.settings.siExpatEmployerRate, s.settings.siWageCeiling]).toEqual([8, 14.5, 2, 3000]);
    const omani = computePayslip(s, employee());
    expect([omani.siEmployee, omani.siEmployer]).toEqual([48, 87]);
    const rich = computePayslip(s, employee({ basicSalary: 4000 }));
    expect([rich.siEmployee, rich.siEmployer]).toEqual([240, 435]); // capped at OMR 3,000
    const expat = computePayslip(s, employee({ nationality: 'expat' }));
    expect([expat.siEmployee, expat.siEmployer]).toEqual([0, 12]);
    expect(computePayslip(s, employee({ socialInsurance: false })).siEmployer).toBe(0);
  });
});
