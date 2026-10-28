import { confirmAsset, postDepreciations, saveAsset } from './assets';
import { Point, signatureSvg, svgDataUri } from './branding';
import { addUser } from './auth';
import { invoiceStatus, newInvoiceLine, newMove, PaymentInput, postMove, reconcileStatementLine, registerPayment, saveDraft, saveStatementLine, suggestMatches, WriteOff } from './engine';
import { newPayrollRun, payPayroll, postPayroll, savePayrollRun } from './operations';
import { createCompany, CompanySetup } from './template';
import { AppState, Employee, Partner, Product } from './types';
import { addDays, addMonths, newId, startOfMonth, today } from './utils';

function partner(p: Partial<Partner> & { name: string }): Partner {
  return { id: newId(), email: '', phone: '', street: '', city: '', country: 'Oman', taxId: '', isCustomer: false, isVendor: false, notes: '', active: true, ...p };
}

function employee(p: Partial<Employee> & { name: string; basicSalary: number }): Employee {
  return {
    id: newId(),
    code: '',
    position: '',
    nationality: 'omani',
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowance: 0,
    socialInsurance: true,
    bankName: 'Bank Muscat',
    iban: '',
    joinDate: '2024-01-01',
    active: true,
    ...p,
  };
}

/** A company populated with realistic Omani demo data (used by the UAT build and tests). */
/** A handwriting-like scribble for the demo signature: a looped capital, a run of letters and an underline. */
function demoSignature(): Point[][] {
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

export function createDemoCompany(
  setup: CompanySetup = { companyName: 'Hisab Demo Trading LLC', currency: 'OMR', vatRate: 5, country: 'OM' },
): AppState {
  let s = createCompany(setup);
  s = addUser(s, { username: 'admin', name: 'Demo Administrator', role: 'admin', password: 'demo1234' }).state;
  s = addUser(s, { username: 'accountant', name: 'Demo Accountant', role: 'accountant', password: 'demo1234' }).state;
  s = addUser(s, { username: 'owner', name: 'Demo Owner (read-only)', role: 'viewer', password: 'demo1234' }).state;
  s = { ...s, settings: { ...s.settings, companyNameAr: 'شركة حساب التجريبية للتجارة ش.م.م', companyAddress: 'Al Khuwair, Muscat\nSultanate of Oman', companyTaxId: 'OM1100000000', companyPhone: '+968 2400 0000', companyEmail: 'accounts@hisab-demo.om' } };
  s = { ...s, settings: { ...s.settings, stampMode: 'generated', signatureImage: svgDataUri(signatureSvg(demoSignature())!), signatoryName: 'Ahmed Al Balushi', signatoryTitle: 'General Manager' } };
  const acc = (code: string) => s.accounts.find((a) => a.code === code)!.id;
  const saleTax = s.settings.defaultSaleTaxId!;
  const purchaseTax = s.settings.defaultPurchaseTaxId!;
  const reverseTax = s.taxes.find((t) => t.vatCategory === 'reverse_charge')!.id;
  const bank = s.journals.find((j) => j.type === 'bank')!;
  const cash = s.journals.find((j) => j.type === 'cash')!;
  const term30 = s.paymentTerms.find((t) => t.days === 30 && !t.endOfMonth)!.id;

  const customers = [
    partner({ name: 'Al Noor Hypermarket', email: 'ap@alnoor.example', city: 'Muscat', isCustomer: true, taxId: 'OM1100123456', paymentTermId: term30 }),
    partner({ name: 'Sohar Tech Solutions', email: 'finance@sohartech.example', city: 'Sohar', isCustomer: true, taxId: 'OM1100654321' }),
    partner({ name: 'Nizwa Heritage Hotel', email: 'accounts@nizwahotel.example', city: 'Nizwa', isCustomer: true }),
  ];
  const vendors = [
    partner({ name: 'Muscat Office Supplies', email: 'billing@mos.example', isVendor: true, taxId: 'OM1100777777' }),
    partner({ name: 'Nama Electricity', isVendor: true }),
    partner({ name: 'Qurum Properties LLC', isVendor: true }),
    partner({ name: 'CloudSoft Ltd (UK)', isVendor: true, country: 'United Kingdom' }),
  ];
  const products: Product[] = [
    { id: newId(), name: 'Consulting Hour', internalRef: 'SRV-001', type: 'service', salePrice: 35, cost: 0, incomeAccountId: acc('401000'), saleTaxIds: [saleTax], purchaseTaxIds: [], active: true },
    { id: newId(), name: 'Office Chair', internalRef: 'FUR-001', type: 'consu', salePrice: 85, cost: 52, incomeAccountId: acc('400000'), expenseAccountId: acc('500000'), saleTaxIds: [saleTax], purchaseTaxIds: [purchaseTax], active: true },
    { id: newId(), name: 'Annual Support Plan', internalRef: 'SRV-002', type: 'service', salePrice: 2400, cost: 0, incomeAccountId: acc('401000'), saleTaxIds: [saleTax], purchaseTaxIds: [], active: true },
    { id: newId(), name: 'Printer Paper (box)', internalRef: 'SUP-001', type: 'consu', salePrice: 0, cost: 9.5, expenseAccountId: acc('615000'), saleTaxIds: [], purchaseTaxIds: [purchaseTax], active: true },
  ];
  const employees = [
    employee({ name: 'Ahmed Al Balushi', code: 'E001', position: 'Accountant', basicSalary: 700, housingAllowance: 200, transportAllowance: 60 }),
    employee({ name: 'Fatma Al Hinai', code: 'E002', position: 'Sales Executive', basicSalary: 550, housingAllowance: 150, transportAllowance: 50 }),
    employee({ name: 'Ravi Kumar', code: 'E003', position: 'Store Keeper', nationality: 'expat', socialInsurance: false, basicSalary: 300, housingAllowance: 75, otherAllowance: 25 }),
  ];
  s = {
    ...s,
    partners: [...customers, ...vendors],
    products,
    employees,
    analyticAccounts: [
      { id: newId(), name: 'Muscat Branch', code: 'MCT', active: true },
      { id: newId(), name: 'Sohar Branch', code: 'SOH', active: true },
    ],
    budgets: [
      {
        id: newId(),
        name: 'Operating Budget',
        active: true,
        lines: [
          { accountId: acc('401000'), monthly: 1500 },
          { accountId: acc('400000'), monthly: 800 },
          { accountId: acc('611000'), monthly: 2300 },
          { accountId: acc('612000'), monthly: 600 },
          { accountId: acc('613000'), monthly: 150 },
          { accountId: acc('615000'), monthly: 80 },
        ],
      },
    ],
  };

  const t = today();
  const m = (offset: number, day = 5) => addDays(startOfMonth(addMonths(t, offset)), day - 1);
  const pay = (input: Omit<PaymentInput, 'date' | 'journalId' | 'memo'> & Partial<PaymentInput>, date: string) => {
    s = registerPayment(s, { journalId: bank.id, memo: '', date, ...input }).state;
  };
  const total = (id: string) => invoiceStatus(s, s.moves.find((x) => x.id === id)!).total;

  /** A bank statement line, reconciled with the given open items or booked on a counterpart account. */
  const bankLine = (date: string, label: string, amount: number, match: 'auto' | 'none' | WriteOff) => {
    const sl = { id: newId(), journalId: bank.id, date, label, amount, ref: '', reconciled: false };
    s = saveStatementLine(s, sl);
    if (match === 'none') return;
    if (match === 'auto') s = reconcileStatementLine(s, sl.id, [suggestMatches(s, sl)[0].line.id]);
    else s = reconcileStatementLine(s, sl.id, [], match);
  };

  bankLine(m(-5, 1), 'CAPITAL DEPOSIT - SHAREHOLDERS', 20000, { accountId: acc('301000'), label: 'Capital injection' });
  let open = newMove(s, 'entry', { date: m(-5, 1), ref: 'Opening cash float' });
  open = { ...open, lines: [
    { id: newId(), accountId: acc('101501'), label: 'Opening cash float', debit: 500, credit: 0, kind: 'other' },
    { id: newId(), accountId: acc('301000'), label: 'Opening cash float', debit: 0, credit: 500, kind: 'other' },
  ] };
  s = postMove(saveDraft(s, open), open.id);

  const invoice = (customer: Partner, date: string, lines: [Product, number][], post = true) => {
    let mv = newMove(s, 'out_invoice', { partnerId: customer.id, date, invoiceDate: date, paymentTermId: customer.paymentTermId ?? s.settings.defaultPaymentTermId });
    mv = { ...mv, invoiceLines: lines.map(([p, q]) => newInvoiceLine({ productId: p.id, label: p.name, quantity: q, priceUnit: p.salePrice, taxIds: p.saleTaxIds, accountId: p.incomeAccountId })) };
    s = saveDraft(s, mv);
    if (post) s = postMove(s, mv.id);
    return mv.id;
  };
  const bill = (vendor: Partner, date: string, label: string, amount: number, accountCode: string, ref: string, taxId = purchaseTax) => {
    let mv = newMove(s, 'in_invoice', { partnerId: vendor.id, date, invoiceDate: date, ref });
    mv = { ...mv, invoiceLines: [newInvoiceLine({ label, quantity: 1, priceUnit: amount, taxIds: [taxId], accountId: acc(accountCode) })] };
    s = postMove(saveDraft(s, mv), mv.id);
    return mv.id;
  };

  const inv1 = invoice(customers[0], m(-4), [[products[0], 20], [products[1], 4]]);
  const inv2 = invoice(customers[1], m(-3), [[products[2], 1]]);
  const inv3 = invoice(customers[2], m(-2), [[products[0], 12]]);
  const inv4 = invoice(customers[0], m(-1), [[products[1], 40]]);
  invoice(customers[1], m(0, 2), [[products[0], 8]]);
  invoice(customers[2], m(0, 3), [[products[2], 1]], false);

  const b1 = bill(vendors[2], m(-4, 1), 'Office rent', 600, '612000', 'RENT-Q2');
  const b2 = bill(vendors[1], m(-2, 10), 'Electricity', 125, '613000', 'NAMA-8841');
  bill(vendors[0], m(-1, 12), 'Printer paper and supplies', 95, '615000', 'MOS-2231');
  bill(vendors[3], m(-1, 15), 'Cloud software subscription', 120, '619000', 'CS-0042', reverseTax);

  // Receipts: bank transfer, partial payment, cheque, card and cash
  pay({ paymentType: 'inbound', partnerType: 'customer', partnerId: customers[0].id, amount: total(inv1), method: 'bank_transfer', moveIds: [inv1], memo: 'INV payment' }, m(-3, 20));
  pay({ paymentType: 'inbound', partnerType: 'customer', partnerId: customers[1].id, amount: 300, method: 'bank_transfer', moveIds: [inv2], memo: 'Partial payment' }, m(-2, 15));
  pay({ paymentType: 'inbound', partnerType: 'customer', partnerId: customers[2].id, amount: total(inv3), method: 'cheque', chequeNumber: '004512', chequeBank: 'Bank Dhofar', chequeDate: m(0, 1), moveIds: [inv3] }, m(-1, 25));
  pay({ paymentType: 'inbound', partnerType: 'customer', partnerId: customers[0].id, amount: 200, method: 'card', moveIds: [inv4], memo: 'Card payment' }, addDays(t, -1));
  pay({ paymentType: 'inbound', partnerType: 'customer', partnerId: customers[1].id, amount: 50, journalId: cash.id, memo: 'Advance received' }, addDays(t, -1));
  // Payments: rent by cheque, electricity by transfer, petty cash expense
  pay({ paymentType: 'outbound', partnerType: 'supplier', partnerId: vendors[2].id, amount: total(b1), method: 'cheque', chequeNumber: '100231', chequeBank: 'Bank Muscat', moveIds: [b1] }, m(-4, 3));
  pay({ paymentType: 'outbound', partnerType: 'supplier', partnerId: vendors[1].id, amount: total(b2), method: 'bank_transfer', moveIds: [b2] }, m(-2, 20));
  pay({ paymentType: 'outbound', partnerType: 'other', amount: 12.6, journalId: cash.id, counterpartAccountId: acc('618000'), taxId: purchaseTax, memo: 'Fuel - petty cash' }, addDays(t, -1));

  // Payroll for the last two months, paid by bank transfer (WPS)
  for (const off of [-2, -1]) {
    const month = addMonths(t, off).slice(0, 7);
    const run = newPayrollRun(s, month);
    s = savePayrollRun(s, run);
    s = postPayroll(s, run.id);
    const payDate = addDays(run.date, 1) > t ? t : addDays(run.date, 1);
    s = payPayroll(s, run.id, bank.id, payDate);
    const net = s.moves.find((x) => x.id === s.payrollRuns.find((r) => r.id === run.id)!.paymentMoveId)!.lines[0].debit;
    const sl = { id: newId(), journalId: bank.id, date: payDate, label: `WPS SALARIES ${month}`, amount: -net, ref: '', reconciled: false };
    s = saveStatementLine(s, sl);
    const out = s.moves.find((x) => x.origin === 'payroll' && x.date === payDate && x.lines.some((l) => l.accountId === s.settings.outstandingPaymentsAccountId))!;
    s = reconcileStatementLine(s, sl.id, [out.lines.find((l) => l.accountId === s.settings.outstandingPaymentsAccountId)!.id]);
  }

  // Bank feed: matched transactions, then two left for the user to reconcile
  bankLine(m(-3, 21), 'TRF AL NOOR HYPERMARKET', total(inv1), 'auto');
  bankLine(m(-4, 6), 'CHQ 100231 QURUM PROPERTIES', -total(b1), 'auto');
  bankLine(m(-2, 16), 'SOHAR TECH SOLUTIONS PARTIAL', 300, 'auto');
  bankLine(m(-2, 21), 'NAMA ELECTRICITY BILL', -total(b2), 'auto');
  bankLine(m(-1, 28), 'BANK SERVICE CHARGES', -4.5, 'none');
  bankLine(addDays(t, -1), 'CARD SETTLEMENT POS', 196.8, 'none');

  // A running fixed asset
  const asset = {
    id: newId(),
    name: 'Delivery Van',
    acquisitionDate: m(-5, 1),
    firstDepreciationDate: m(-5, 1),
    originalValue: 6000,
    salvageValue: 600,
    durationMonths: 60,
    assetAccountId: acc('151000'),
    depreciationAccountId: acc('151100'),
    expenseAccountId: acc('620000'),
    journalId: s.journals.find((j) => j.type === 'general')!.id,
    state: 'draft' as const,
    depreciationMoveIds: [],
    notes: '',
  };
  bankLine(m(-5, 2), 'AL JAZEERA MOTORS - DELIVERY VAN', -6000, { accountId: acc('151000'), label: 'Delivery Van' });
  s = saveAsset(s, asset);
  s = confirmAsset(s, asset.id);
  s = postDepreciations(s, asset.id, addDays(startOfMonth(t), -1));
  return s;
}
