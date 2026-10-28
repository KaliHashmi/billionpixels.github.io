import { DEMO_COMPANY_NAME, demoBranding } from './branding';
import { Account, AccountType, AppState, ID, Journal, Payment, PaymentTerm, Settings, Tax } from './types';
import { byId, newId } from './utils';

export interface Currency {
  code: string;
  symbol: string;
  decimals: number;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'SAR', symbol: 'SAR', decimals: 2, name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'AED', decimals: 2, name: 'UAE Dirham' },
  { code: 'KWD', symbol: 'KWD', decimals: 3, name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: 'BHD', decimals: 3, name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: 'OMR', decimals: 3, name: 'Omani Rial' },
  { code: 'QAR', symbol: 'QAR', decimals: 2, name: 'Qatari Riyal' },
  { code: 'JOD', symbol: 'JOD', decimals: 3, name: 'Jordanian Dinar' },
  { code: 'EGP', symbol: 'EGP', decimals: 2, name: 'Egyptian Pound' },
  { code: 'IQD', symbol: 'IQD', decimals: 0, name: 'Iraqi Dinar' },
  { code: 'USD', symbol: '$', decimals: 2, name: 'US Dollar' },
  { code: 'EUR', symbol: '€', decimals: 2, name: 'Euro' },
  { code: 'GBP', symbol: '£', decimals: 2, name: 'British Pound' },
  { code: 'INR', symbol: '₹', decimals: 2, name: 'Indian Rupee' },
  { code: 'PKR', symbol: 'Rs', decimals: 2, name: 'Pakistani Rupee' },
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset_receivable: 'Receivable',
  asset_cash: 'Bank and Cash',
  asset_current: 'Current Assets',
  asset_non_current: 'Non-current Assets',
  asset_prepayments: 'Prepayments',
  asset_fixed: 'Fixed Assets',
  liability_payable: 'Payable',
  liability_credit_card: 'Credit Card',
  liability_current: 'Current Liabilities',
  liability_non_current: 'Non-current Liabilities',
  equity: 'Equity',
  equity_unaffected: 'Current Year Earnings',
  income: 'Income',
  income_other: 'Other Income',
  expense: 'Expenses',
  expense_depreciation: 'Depreciation',
  expense_direct_cost: 'Cost of Revenue',
  off_balance: 'Off-Balance Sheet',
};

export function isPnlType(t: AccountType): boolean {
  return t.startsWith('income') || t.startsWith('expense');
}

export function isBalanceSheetType(t: AccountType): boolean {
  return !isPnlType(t) && t !== 'off_balance';
}

type AccountSeed = [code: string, name: string, type: AccountType, reconcile?: boolean];

const ACCOUNTS: AccountSeed[] = [
  ['101401', 'Bank', 'asset_cash'],
  ['101501', 'Cash', 'asset_cash'],
  ['101402', 'Bank Suspense Account', 'asset_current'],
  ['101403', 'Outstanding Receipts', 'asset_current', true],
  ['101404', 'Outstanding Payments', 'asset_current', true],
  ['101405', 'Cheques Under Collection', 'asset_current', true],
  ['101406', 'Card Payments Clearing', 'asset_current', true],
  ['101701', 'Liquidity Transfer', 'asset_current', true],
  ['110100', 'Stock Valuation', 'asset_current'],
  ['121000', 'Account Receivable', 'asset_receivable', true],
  ['131000', 'Input VAT', 'asset_current'],
  ['132000', 'Tax Receivable', 'asset_current'],
  ['141000', 'Prepayments', 'asset_prepayments'],
  ['141100', 'Employee Advances', 'asset_current'],
  ['151000', 'Fixed Asset', 'asset_fixed'],
  ['151100', 'Accumulated Depreciation', 'asset_fixed'],
  ['191000', 'Non-current Assets', 'asset_non_current'],
  ['201000', 'Current Liabilities', 'liability_current'],
  ['201100', 'Cheques Issued - Pending Clearance', 'liability_current', true],
  ['211000', 'Account Payable', 'liability_payable', true],
  ['221000', 'Credit Card', 'liability_credit_card'],
  ['230000', 'Salaries Payable', 'liability_current'],
  ['230100', 'Social Insurance Payable', 'liability_current'],
  ['251000', 'Output VAT', 'liability_current'],
  ['252000', 'VAT Payable', 'liability_current'],
  ['260000', 'Non-current Liabilities', 'liability_non_current'],
  ['301000', 'Capital', 'equity'],
  ['302000', 'Dividends', 'equity'],
  ['999999', 'Undistributed Profits/Losses', 'equity_unaffected'],
  ['400000', 'Product Sales', 'income'],
  ['401000', 'Service Revenue', 'income'],
  ['450000', 'Other Income', 'income_other'],
  ['500000', 'Cost of Goods Sold', 'expense_direct_cost'],
  ['600000', 'Expenses', 'expense'],
  ['611000', 'Salaries & Wages', 'expense'],
  ['611100', 'Social Insurance Expense', 'expense'],
  ['612000', 'Rent', 'expense'],
  ['613000', 'Utilities', 'expense'],
  ['614000', 'Bank Fees', 'expense'],
  ['615000', 'Office Supplies', 'expense'],
  ['616000', 'Marketing', 'expense'],
  ['617000', 'Cash Over/Short', 'expense'],
  ['618000', 'Fuel & Transport', 'expense'],
  ['619000', 'Telephone & Internet', 'expense'],
  ['620000', 'Depreciation Expense', 'expense_depreciation'],
];

export interface Country {
  code: string;
  name: string;
  currency: string;
  vatRate: number;
}

export const COUNTRIES: Country[] = [
  { code: 'OM', name: 'Oman', currency: 'OMR', vatRate: 5 },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', vatRate: 5 },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', vatRate: 15 },
  { code: 'BH', name: 'Bahrain', currency: 'BHD', vatRate: 10 },
  { code: 'QA', name: 'Qatar', currency: 'QAR', vatRate: 0 },
  { code: 'KW', name: 'Kuwait', currency: 'KWD', vatRate: 0 },
  { code: 'XX', name: 'Other', currency: 'USD', vatRate: 0 },
];

export interface CompanySetup {
  companyName: string;
  currency: string;
  vatRate: number;
  country?: string;
  fiscalYearLastMonth?: number;
}

function buildTaxes(rate: number, acc: (code: string) => ID): Tax[] {
  const input = acc('131000');
  const output = acc('251000');
  const tax = (t: Omit<Tax, 'id' | 'active' | 'amountType' | 'priceInclude' | 'reverseCharge'> & Partial<Tax>): Tax => ({
    id: newId(),
    amountType: 'percent',
    priceInclude: false,
    reverseCharge: false,
    active: true,
    ...t,
  });
  return [
    tax({ name: `VAT ${rate}% (Sales)`, typeTaxUse: 'sale', amount: rate, accountId: output, label: `VAT ${rate}%`, vatCategory: 'standard' }),
    tax({ name: `VAT ${rate}% (Purchases)`, typeTaxUse: 'purchase', amount: rate, accountId: input, label: `VAT ${rate}%`, vatCategory: 'standard' }),
    tax({ name: `VAT ${rate}% Incl. (Sales)`, typeTaxUse: 'sale', amount: rate, priceInclude: true, accountId: output, label: `VAT ${rate}% incl.`, vatCategory: 'standard' }),
    tax({ name: 'Zero-rated 0% (Sales)', typeTaxUse: 'sale', amount: 0, accountId: output, label: 'VAT 0%', vatCategory: 'zero' }),
    tax({ name: 'Exports 0%', typeTaxUse: 'sale', amount: 0, accountId: output, label: 'VAT 0% (Export)', vatCategory: 'zero' }),
    tax({ name: 'Exempt (Sales)', typeTaxUse: 'sale', amount: 0, accountId: output, label: 'Exempt', vatCategory: 'exempt' }),
    tax({ name: 'Out of Scope (Sales)', typeTaxUse: 'sale', amount: 0, accountId: output, label: 'Out of scope', vatCategory: 'out_of_scope' }),
    tax({ name: 'Zero-rated 0% (Purchases)', typeTaxUse: 'purchase', amount: 0, accountId: input, label: 'VAT 0%', vatCategory: 'zero' }),
    tax({ name: 'Exempt (Purchases)', typeTaxUse: 'purchase', amount: 0, accountId: input, label: 'Exempt', vatCategory: 'exempt' }),
    tax({ name: `Reverse Charge ${rate}% (Imported Services)`, typeTaxUse: 'purchase', amount: rate, accountId: input, reverseCharge: true, reverseAccountId: output, label: `Reverse charge ${rate}%`, vatCategory: 'reverse_charge' }),
    tax({ name: `Import VAT ${rate}% (Deferred)`, typeTaxUse: 'purchase', amount: rate, accountId: input, reverseCharge: true, reverseAccountId: output, label: `Import VAT ${rate}%`, vatCategory: 'import' }),
  ];
}

const SETTINGS_ACCOUNTS: [keyof Settings, string][] = [
  ['receivableAccountId', '121000'],
  ['payableAccountId', '211000'],
  ['suspenseAccountId', '101402'],
  ['outstandingReceiptsAccountId', '101403'],
  ['outstandingPaymentsAccountId', '101404'],
  ['taxSettlementAccountId', '252000'],
  ['chequesReceivedAccountId', '101405'],
  ['chequesIssuedAccountId', '201100'],
  ['cardClearingAccountId', '101406'],
  ['cashDifferenceAccountId', '617000'],
  ['salaryExpenseAccountId', '611000'],
  ['siExpenseAccountId', '611100'],
  ['salariesPayableAccountId', '230000'],
  ['siPayableAccountId', '230100'],
  ['employeeAdvancesAccountId', '141100'],
];

export function createCompany(setup: CompanySetup): AppState {
  const currency = CURRENCIES.find((c) => c.code === setup.currency) ?? CURRENCIES[0];
  const accounts: Account[] = ACCOUNTS.map(([code, name, type, reconcile]) => ({
    id: newId(),
    code,
    name,
    type,
    reconcile: !!reconcile || type === 'asset_receivable' || type === 'liability_payable',
    active: true,
  }));
  const acc = (code: string) => accounts.find((a) => a.code === code)!.id;

  const journals: Journal[] = [
    { id: newId(), name: 'Customer Invoices', code: 'INV', type: 'sale', defaultAccountId: acc('400000'), active: true },
    { id: newId(), name: 'Vendor Bills', code: 'BILL', type: 'purchase', defaultAccountId: acc('600000'), active: true },
    { id: newId(), name: 'Bank', code: 'BNK1', type: 'bank', defaultAccountId: acc('101401'), active: true },
    { id: newId(), name: 'Cash', code: 'CSH1', type: 'cash', defaultAccountId: acc('101501'), active: true },
    { id: newId(), name: 'Miscellaneous Operations', code: 'MISC', type: 'general', active: true },
  ];

  const taxes = buildTaxes(setup.vatRate, acc);

  const paymentTerms: PaymentTerm[] = [
    { id: newId(), name: 'Immediate Payment', days: 0, endOfMonth: false, active: true },
    { id: newId(), name: '15 Days', days: 15, endOfMonth: false, active: true },
    { id: newId(), name: '30 Days', days: 30, endOfMonth: false, active: true },
    { id: newId(), name: 'End of Following Month', days: 30, endOfMonth: true, active: true },
    { id: newId(), name: '45 Days', days: 45, endOfMonth: false, active: true },
    { id: newId(), name: '60 Days', days: 60, endOfMonth: false, active: true },
  ];

  const oman = (setup.country ?? 'OM') === 'OM';
  const settings = {
    companyName: setup.companyName,
    companyNameAr: '',
    companyAddress: '',
    companyEmail: '',
    companyPhone: '',
    companyTaxId: '',
    country: setup.country ?? 'OM',
    vatRegistered: setup.vatRate > 0,
    currency: currency.code,
    currencySymbol: currency.symbol,
    decimals: currency.decimals,
    fiscalYearLastMonth: setup.fiscalYearLastMonth ?? 12,
    invoiceFooter: 'Thank you for your business.',
    defaultSaleTaxId: taxes[0].id,
    defaultPurchaseTaxId: taxes[1].id,
    defaultPaymentTermId: paymentTerms[2].id,
    // Common Oman rates (incl. Job Security Fund); always confirm current Social Protection Fund rates.
    siEmployeeRate: oman ? 8 : 0,
    siEmployerRate: oman ? 12.5 : 0,
    onboarded: true,
  } as Settings;
  for (const [key, code] of SETTINGS_ACCOUNTS) (settings as unknown as Record<string, string>)[key] = acc(code);

  return {
    settings,
    accounts,
    journals,
    taxes,
    paymentTerms,
    partners: [],
    products: [],
    analyticAccounts: [],
    moves: [],
    reconciles: [],
    payments: [],
    statementLines: [],
    assets: [],
    budgets: [],
    employees: [],
    payrollRuns: [],
    cashClosings: [],
    users: [],
    sequences: {},
  };
}

/**
 * Upgrade books created by an older version: add new standard accounts, default
 * settings and fields so every feature works on existing data.
 */
export function ensureCompanyDefaults(state: AppState): AppState {
  let accounts = state.accounts;
  for (const [code, name, type, reconcile] of ACCOUNTS) {
    if (accounts.some((a) => a.code === code)) continue;
    accounts = [...accounts, { id: newId(), code, name, type, reconcile: !!reconcile, active: true }];
  }
  const byCode = (code: string) => accounts.find((a) => a.code === code)?.id ?? '';
  const settings = { ...state.settings } as unknown as Record<string, unknown>;
  for (const [key, code] of SETTINGS_ACCOUNTS) if (!settings[key]) settings[key] = byCode(code);
  const defaults: Partial<Settings> = { country: 'XX', companyNameAr: '', vatRegistered: true, siEmployeeRate: 0, siEmployerRate: 0 };
  for (const [k, v] of Object.entries(defaults)) if (settings[k] === undefined) settings[k] = v;
  // Demo books saved before stamps existed get the demo stamp and signature.
  const demoUpgrade = settings.companyName === DEMO_COMPANY_NAME && settings.stampMode === undefined && settings.signatureImage === undefined;
  if (demoUpgrade) Object.assign(settings, demoBranding());

  const taxes = state.taxes.map((t) =>
    t.vatCategory ? t : { ...t, vatCategory: (t.amount > 0 ? 'standard' : 'zero') as Tax['vatCategory'], reverseCharge: !!t.reverseCharge },
  );
  const journals = byId(state.journals);
  const payments = state.payments.map((p) =>
    p.method ? p : { ...p, method: (journals.get(p.journalId)?.type === 'cash' ? 'cash' : 'bank_transfer') as Payment['method'] },
  );
  const changed =
    demoUpgrade ||
    accounts !== state.accounts ||
    SETTINGS_ACCOUNTS.some(([k]) => settings[k] !== state.settings[k]) ||
    Object.keys(defaults).some((k) => settings[k] !== (state.settings as unknown as Record<string, unknown>)[k]) ||
    taxes.some((t, i) => t !== state.taxes[i]) ||
    payments.some((p, i) => p !== state.payments[i]);
  if (!changed) return state;
  return { ...state, accounts, settings: settings as unknown as Settings, taxes, payments };
}
