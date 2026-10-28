import { Account, AccountType, AppState, Journal, PaymentTerm, Tax } from './types';
import { newId } from './utils';

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
  ['101701', 'Liquidity Transfer', 'asset_current', true],
  ['110100', 'Stock Valuation', 'asset_current'],
  ['121000', 'Account Receivable', 'asset_receivable', true],
  ['131000', 'Tax Paid', 'asset_current'],
  ['132000', 'Tax Receivable', 'asset_current'],
  ['141000', 'Prepayments', 'asset_prepayments'],
  ['151000', 'Fixed Asset', 'asset_fixed'],
  ['151100', 'Accumulated Depreciation', 'asset_fixed'],
  ['191000', 'Non-current Assets', 'asset_non_current'],
  ['201000', 'Current Liabilities', 'liability_current'],
  ['211000', 'Account Payable', 'liability_payable', true],
  ['221000', 'Credit Card', 'liability_credit_card'],
  ['230000', 'Salaries Payable', 'liability_current'],
  ['251000', 'Tax Received', 'liability_current'],
  ['252000', 'Tax Payable', 'liability_current'],
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
  ['612000', 'Rent', 'expense'],
  ['613000', 'Utilities', 'expense'],
  ['614000', 'Bank Fees', 'expense'],
  ['615000', 'Office Supplies', 'expense'],
  ['616000', 'Marketing', 'expense'],
  ['620000', 'Depreciation Expense', 'expense_depreciation'],
];

export interface CompanySetup {
  companyName: string;
  currency: string;
  vatRate: number;
  fiscalYearLastMonth?: number;
}

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

  const rate = setup.vatRate;
  const taxes: Tax[] = [
    { id: newId(), name: `${rate}% (Sales)`, typeTaxUse: 'sale', amountType: 'percent', amount: rate, priceInclude: false, accountId: acc('251000'), label: `VAT ${rate}%`, active: true },
    { id: newId(), name: `${rate}% (Purchases)`, typeTaxUse: 'purchase', amountType: 'percent', amount: rate, priceInclude: false, accountId: acc('131000'), label: `VAT ${rate}%`, active: true },
    { id: newId(), name: `${rate}% Incl. (Sales)`, typeTaxUse: 'sale', amountType: 'percent', amount: rate, priceInclude: true, accountId: acc('251000'), label: `VAT ${rate}% incl.`, active: true },
    { id: newId(), name: '0% Zero-rated (Sales)', typeTaxUse: 'sale', amountType: 'percent', amount: 0, priceInclude: false, accountId: acc('251000'), label: 'VAT 0%', active: true },
    { id: newId(), name: '0% Exempt (Purchases)', typeTaxUse: 'purchase', amountType: 'percent', amount: 0, priceInclude: false, accountId: acc('131000'), label: 'Exempt', active: true },
  ];

  const paymentTerms: PaymentTerm[] = [
    { id: newId(), name: 'Immediate Payment', days: 0, endOfMonth: false, active: true },
    { id: newId(), name: '15 Days', days: 15, endOfMonth: false, active: true },
    { id: newId(), name: '30 Days', days: 30, endOfMonth: false, active: true },
    { id: newId(), name: 'End of Following Month', days: 30, endOfMonth: true, active: true },
    { id: newId(), name: '45 Days', days: 45, endOfMonth: false, active: true },
    { id: newId(), name: '60 Days', days: 60, endOfMonth: false, active: true },
  ];

  return {
    settings: {
      companyName: setup.companyName,
      companyAddress: '',
      companyEmail: '',
      companyPhone: '',
      companyTaxId: '',
      currency: currency.code,
      currencySymbol: currency.symbol,
      decimals: currency.decimals,
      fiscalYearLastMonth: setup.fiscalYearLastMonth ?? 12,
      invoiceFooter: 'Thank you for your business.',
      receivableAccountId: acc('121000'),
      payableAccountId: acc('211000'),
      suspenseAccountId: acc('101402'),
      outstandingReceiptsAccountId: acc('101403'),
      outstandingPaymentsAccountId: acc('101404'),
      taxSettlementAccountId: acc('252000'),
      defaultSaleTaxId: taxes[0].id,
      defaultPurchaseTaxId: taxes[1].id,
      defaultPaymentTermId: paymentTerms[2].id,
      onboarded: true,
    },
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
    sequences: {},
  };
}
