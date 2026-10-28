import { newInvoiceLine, newMove, postMove, registerPayment, saveDraft, saveStatementLine } from './engine';
import { confirmAsset, postDepreciations, saveAsset } from './assets';
import { createCompany, CompanySetup } from './template';
import { AppState, Partner, Product } from './types';
import { addDays, addMonths, newId, startOfMonth, today } from './utils';

function partner(p: Partial<Partner> & { name: string }): Partner {
  return {
    id: newId(),
    email: '',
    phone: '',
    street: '',
    city: '',
    country: '',
    taxId: '',
    isCustomer: false,
    isVendor: false,
    notes: '',
    active: true,
    ...p,
  };
}

/** A company populated with realistic demo data (used by the UAT build and for testing). */
export function createDemoCompany(setup: CompanySetup = { companyName: 'Hisab Demo Trading Co.', currency: 'SAR', vatRate: 15 }): AppState {
  let s = createCompany(setup);
  const acc = (code: string) => s.accounts.find((a) => a.code === code)!.id;
  const saleTax = s.settings.defaultSaleTaxId!;
  const purchaseTax = s.settings.defaultPurchaseTaxId!;
  const bank = s.journals.find((j) => j.type === 'bank')!;
  const term30 = s.paymentTerms.find((t) => t.days === 30 && !t.endOfMonth)!.id;

  const customers = [
    partner({ name: 'Al Noor Supermarkets', email: 'ap@alnoor.example', city: 'Riyadh', country: 'Saudi Arabia', isCustomer: true, taxId: '300000000000003', paymentTermId: term30 }),
    partner({ name: 'Gulf Tech Solutions', email: 'finance@gulftech.example', city: 'Dubai', country: 'UAE', isCustomer: true }),
    partner({ name: 'Desert Rose Hotel', email: 'accounts@desertrose.example', city: 'Jeddah', country: 'Saudi Arabia', isCustomer: true }),
  ];
  const vendors = [
    partner({ name: 'Office Depot Arabia', email: 'billing@officedepot.example', isVendor: true }),
    partner({ name: 'Saudi Electricity Co.', isVendor: true }),
    partner({ name: 'Riyadh Properties LLC', isVendor: true }),
  ];
  const products: Product[] = [
    { id: newId(), name: 'Consulting Hour', internalRef: 'SRV-001', type: 'service', salePrice: 350, cost: 0, incomeAccountId: acc('401000'), saleTaxIds: [saleTax], purchaseTaxIds: [], active: true },
    { id: newId(), name: 'Office Chair', internalRef: 'FUR-001', type: 'consu', salePrice: 850, cost: 520, incomeAccountId: acc('400000'), expenseAccountId: acc('500000'), saleTaxIds: [saleTax], purchaseTaxIds: [purchaseTax], active: true },
    { id: newId(), name: 'Annual Support Plan', internalRef: 'SRV-002', type: 'service', salePrice: 4800, cost: 0, incomeAccountId: acc('401000'), saleTaxIds: [saleTax], purchaseTaxIds: [], active: true },
    { id: newId(), name: 'Printer Paper (box)', internalRef: 'SUP-001', type: 'consu', salePrice: 0, cost: 95, expenseAccountId: acc('615000'), saleTaxIds: [], purchaseTaxIds: [purchaseTax], active: true },
  ];
  s = {
    ...s,
    partners: [...customers, ...vendors],
    products,
    analyticAccounts: [
      { id: newId(), name: 'Riyadh Branch', code: 'RUH', active: true },
      { id: newId(), name: 'Jeddah Branch', code: 'JED', active: true },
    ],
  };

  const t = today();
  const m = (offset: number, day = 5) => addDays(startOfMonth(addMonths(t, offset)), day - 1);

  // Opening capital
  let open = newMove(s, 'entry', { date: m(-5, 1), ref: 'Opening capital' });
  open = { ...open, lines: [
    { id: newId(), accountId: acc('101401'), label: 'Capital injection', debit: 100000, credit: 0, kind: 'other' },
    { id: newId(), accountId: acc('301000'), label: 'Capital injection', debit: 0, credit: 100000, kind: 'other' },
  ] };
  s = postMove(saveDraft(s, open), open.id);

  const invoice = (customer: Partner, date: string, lines: [Product, number][], post = true) => {
    let mv = newMove(s, 'out_invoice', { partnerId: customer.id, date, invoiceDate: date, paymentTermId: customer.paymentTermId ?? s.settings.defaultPaymentTermId });
    mv = { ...mv, invoiceLines: lines.map(([p, q]) => newInvoiceLine({ productId: p.id, label: p.name, quantity: q, priceUnit: p.salePrice, taxIds: p.saleTaxIds, accountId: p.incomeAccountId })) };
    s = saveDraft(s, mv);
    if (post) s = postMove(s, mv.id);
    return mv.id;
  };
  const bill = (vendor: Partner, date: string, label: string, amount: number, accountCode: string, ref: string) => {
    let mv = newMove(s, 'in_invoice', { partnerId: vendor.id, date, invoiceDate: date, ref });
    mv = { ...mv, invoiceLines: [newInvoiceLine({ label, quantity: 1, priceUnit: amount, taxIds: [purchaseTax], accountId: acc(accountCode) })] };
    s = postMove(saveDraft(s, mv), mv.id);
    return mv.id;
  };

  const inv1 = invoice(customers[0], m(-4), [[products[0], 20], [products[1], 4]]);
  const inv2 = invoice(customers[1], m(-3), [[products[2], 1]]);
  const inv3 = invoice(customers[2], m(-2), [[products[0], 12]]);
  invoice(customers[0], m(-1), [[products[1], 10]]);
  invoice(customers[1], m(0, 2), [[products[0], 8]]);
  invoice(customers[2], m(0, 3), [[products[2], 1]], false);

  const b1 = bill(vendors[2], m(-4, 1), 'Office rent', 6000, '612000', 'RENT-Q1');
  bill(vendors[1], m(-2, 10), 'Electricity', 1250, '613000', 'SEC-8841');
  bill(vendors[0], m(-1, 12), 'Printer paper and supplies', 950, '615000', 'OD-2231');

  s = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customers[0].id, amount: 11960, date: m(-3, 20), journalId: bank.id, memo: 'INV payment', moveIds: [inv1] }).state;
  s = registerPayment(s, { paymentType: 'inbound', partnerType: 'customer', partnerId: customers[1].id, amount: 3000, date: m(-2, 15), journalId: bank.id, memo: 'Partial payment', moveIds: [inv2] }).state;
  s = registerPayment(s, { paymentType: 'outbound', partnerType: 'supplier', partnerId: vendors[2].id, amount: 6900, date: m(-4, 3), journalId: bank.id, memo: 'Rent', moveIds: [b1] }).state;
  void inv3;

  // Bank feed
  for (const [date, label, amount] of [
    [m(-3, 21), 'TRANSFER AL NOOR SUPERMARKETS', 11960],
    [m(-4, 4), 'RIYADH PROPERTIES RENT', -6900],
    [m(-2, 16), 'GULF TECH SOLUTIONS PARTIAL', 3000],
    [m(-1, 28), 'BANK SERVICE CHARGES', -45],
    [m(0, 1), 'DESERT ROSE HOTEL', 4830],
  ] as [string, string, number][]) {
    s = saveStatementLine(s, { id: newId(), journalId: bank.id, date, label, amount, ref: '', reconciled: false });
  }

  // A running fixed asset
  const asset = {
    id: newId(),
    name: 'Delivery Van',
    acquisitionDate: m(-5, 1),
    firstDepreciationDate: m(-5, 1),
    originalValue: 60000,
    salvageValue: 6000,
    durationMonths: 60,
    assetAccountId: acc('151000'),
    depreciationAccountId: acc('151100'),
    expenseAccountId: acc('620000'),
    journalId: s.journals.find((j) => j.type === 'general')!.id,
    state: 'draft' as const,
    depreciationMoveIds: [],
    notes: '',
  };
  let van = newMove(s, 'entry', { date: m(-5, 1), ref: 'Delivery van purchase' });
  van = { ...van, lines: [
    { id: newId(), accountId: acc('151000'), label: 'Delivery Van', debit: 60000, credit: 0, kind: 'other' },
    { id: newId(), accountId: acc('101401'), label: 'Delivery Van', debit: 0, credit: 60000, kind: 'other' },
  ] };
  s = postMove(saveDraft(s, van), van.id);
  s = saveAsset(s, asset);
  s = confirmAsset(s, asset.id);
  s = postDepreciations(s, asset.id, addDays(startOfMonth(t), -1));
  return s;
}
