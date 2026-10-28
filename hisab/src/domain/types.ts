export type ID = string;

export type AccountType =
  | 'asset_receivable'
  | 'asset_cash'
  | 'asset_current'
  | 'asset_non_current'
  | 'asset_prepayments'
  | 'asset_fixed'
  | 'liability_payable'
  | 'liability_credit_card'
  | 'liability_current'
  | 'liability_non_current'
  | 'equity'
  | 'equity_unaffected'
  | 'income'
  | 'income_other'
  | 'expense'
  | 'expense_depreciation'
  | 'expense_direct_cost'
  | 'off_balance';

export interface Account {
  id: ID;
  code: string;
  name: string;
  type: AccountType;
  /** Allow matching of journal items (receivable, payable, outstanding accounts...). */
  reconcile: boolean;
  active: boolean;
}

export type JournalType = 'sale' | 'purchase' | 'bank' | 'cash' | 'general';

export interface Journal {
  id: ID;
  name: string;
  code: string;
  type: JournalType;
  /** Income/expense account for sale/purchase journals, liquidity account for bank/cash. */
  defaultAccountId?: ID;
  active: boolean;
}

export type TaxUse = 'sale' | 'purchase' | 'none';

export interface Tax {
  id: ID;
  name: string;
  typeTaxUse: TaxUse;
  amountType: 'percent' | 'fixed';
  amount: number;
  priceInclude: boolean;
  accountId: ID;
  /** Label printed on invoices, e.g. "VAT 15%". */
  label: string;
  active: boolean;
}

export interface PaymentTerm {
  id: ID;
  name: string;
  days: number;
  /** Due at the end of the month after adding days. */
  endOfMonth: boolean;
  active: boolean;
}

export interface Partner {
  id: ID;
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  country: string;
  taxId: string;
  isCustomer: boolean;
  isVendor: boolean;
  paymentTermId?: ID;
  notes: string;
  active: boolean;
}

export interface Product {
  id: ID;
  name: string;
  internalRef: string;
  type: 'service' | 'consu';
  salePrice: number;
  cost: number;
  incomeAccountId?: ID;
  expenseAccountId?: ID;
  saleTaxIds: ID[];
  purchaseTaxIds: ID[];
  active: boolean;
}

export interface AnalyticAccount {
  id: ID;
  name: string;
  code: string;
  active: boolean;
}

export type MoveType = 'entry' | 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund';
export type MoveState = 'draft' | 'posted' | 'cancel';
export type PaymentState = 'not_paid' | 'partial' | 'in_payment' | 'paid' | 'reversed';

export interface InvoiceLine {
  id: ID;
  productId?: ID;
  label: string;
  quantity: number;
  priceUnit: number;
  /** Discount in percent. */
  discount: number;
  taxIds: ID[];
  accountId?: ID;
  analyticAccountId?: ID;
}

export type LineKind = 'product' | 'tax' | 'payment_term' | 'other';

export interface MoveLine {
  id: ID;
  accountId: ID;
  partnerId?: ID;
  label: string;
  debit: number;
  credit: number;
  kind: LineKind;
  /** Tax that generated this line (tax lines). */
  taxId?: ID;
  /** Taxes applied on this line (base lines). */
  taxIds?: ID[];
  analyticAccountId?: ID;
  dateMaturity?: string;
}

export type MoveOrigin = 'manual' | 'payment' | 'statement' | 'asset' | 'tax_closing';

export interface Move {
  id: ID;
  moveType: MoveType;
  /** Sequence number, '/' until first posted. */
  name: string;
  state: MoveState;
  journalId: ID;
  partnerId?: ID;
  /** Accounting date. */
  date: string;
  invoiceDate?: string;
  dueDate?: string;
  paymentTermId?: ID;
  ref: string;
  narration: string;
  invoiceLines: InvoiceLine[];
  lines: MoveLine[];
  reversedEntryId?: ID;
  origin: MoveOrigin;
  originId?: ID;
  createdAt: string;
  postedAt?: string;
}

export interface Reconcile {
  id: ID;
  debitLineId: ID;
  creditLineId: ID;
  debitMoveId: ID;
  creditMoveId: ID;
  amount: number;
  date: string;
}

export interface Payment {
  id: ID;
  name: string;
  paymentType: 'inbound' | 'outbound';
  partnerType: 'customer' | 'supplier';
  partnerId?: ID;
  amount: number;
  date: string;
  journalId: ID;
  memo: string;
  state: 'posted' | 'cancel';
  moveId: ID;
}

export interface StatementLine {
  id: ID;
  journalId: ID;
  date: string;
  label: string;
  partnerId?: ID;
  /** Positive = money in, negative = money out. */
  amount: number;
  ref: string;
  moveId?: ID;
  reconciled: boolean;
}

export interface Asset {
  id: ID;
  name: string;
  acquisitionDate: string;
  firstDepreciationDate: string;
  originalValue: number;
  salvageValue: number;
  durationMonths: number;
  assetAccountId: ID;
  depreciationAccountId: ID;
  expenseAccountId: ID;
  journalId: ID;
  state: 'draft' | 'running' | 'closed';
  depreciationMoveIds: ID[];
  notes: string;
}

export interface Settings {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyTaxId: string;
  currency: string;
  currencySymbol: string;
  decimals: number;
  /** Fiscal year ends at the end of this month (1-12). */
  fiscalYearLastMonth: number;
  lockDate?: string;
  taxLockDate?: string;
  invoiceFooter: string;
  receivableAccountId: ID;
  payableAccountId: ID;
  suspenseAccountId: ID;
  outstandingReceiptsAccountId: ID;
  outstandingPaymentsAccountId: ID;
  taxSettlementAccountId: ID;
  defaultSaleTaxId?: ID;
  defaultPurchaseTaxId?: ID;
  defaultPaymentTermId?: ID;
  onboarded: boolean;
}

export interface AppState {
  settings: Settings;
  accounts: Account[];
  journals: Journal[];
  taxes: Tax[];
  paymentTerms: PaymentTerm[];
  partners: Partner[];
  products: Product[];
  analyticAccounts: AnalyticAccount[];
  moves: Move[];
  reconciles: Reconcile[];
  payments: Payment[];
  statementLines: StatementLine[];
  assets: Asset[];
  sequences: Record<string, number>;
}

export type CollectionName = Exclude<keyof AppState, 'settings' | 'sequences'>;

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingError';
  }
}
