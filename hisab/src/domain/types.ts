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

/** VAT treatment, used to build the VAT return. */
export type VatCategory = 'standard' | 'zero' | 'exempt' | 'out_of_scope' | 'reverse_charge' | 'import';

export interface Tax {
  id: ID;
  name: string;
  typeTaxUse: TaxUse;
  amountType: 'percent' | 'fixed';
  amount: number;
  priceInclude: boolean;
  accountId: ID;
  /** Label printed on invoices, e.g. "VAT 5%". */
  label: string;
  vatCategory: VatCategory;
  /**
   * Self-assessed tax (imported services, deferred import VAT): the buyer books both the
   * input VAT (accountId) and the output VAT (reverseAccountId); it does not change the total.
   */
  reverseCharge: boolean;
  reverseAccountId?: ID;
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
  /** Output-VAT side of a reverse-charge tax. */
  reverseCharge?: boolean;
  analyticAccountId?: ID;
  dateMaturity?: string;
}

export type MoveOrigin = 'manual' | 'payment' | 'statement' | 'asset' | 'tax_closing' | 'cheque' | 'cash_closing' | 'payroll';

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

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque';

export interface Payment {
  id: ID;
  /** Voucher number: RV/2026/00001 (receipt) or PV/2026/00001 (payment). */
  name: string;
  paymentType: 'inbound' | 'outbound';
  /** 'other' = direct income/expense paid or received (no customer/vendor balance). */
  partnerType: 'customer' | 'supplier' | 'other';
  partnerId?: ID;
  amount: number;
  date: string;
  journalId: ID;
  memo: string;
  method: PaymentMethod;
  chequeNumber?: string;
  chequeBank?: string;
  /** Cheque date (post-dated cheques). */
  chequeDate?: string;
  /** Entry that cleared the cheque when it was not matched through a bank statement. */
  clearingMoveId?: ID;
  bounced?: boolean;
  /** For partnerType 'other': the income/expense account and optional tax (amount is tax-included). */
  counterpartAccountId?: ID;
  taxId?: ID;
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

export interface Budget {
  id: ID;
  name: string;
  /** Planned amount per month for each income/expense account. */
  lines: { accountId: ID; monthly: number }[];
  active: boolean;
}

export interface Employee {
  id: ID;
  name: string;
  code: string;
  position: string;
  nationality: 'omani' | 'expat';
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  /** Contributes to social insurance (Social Protection Fund). */
  socialInsurance: boolean;
  bankName: string;
  iban: string;
  joinDate: string;
  active: boolean;
}

export interface Payslip {
  employeeId: ID;
  basic: number;
  allowances: number;
  overtime: number;
  deductions: number;
  siEmployee: number;
  siEmployer: number;
  net: number;
}

export interface PayrollRun {
  id: ID;
  /** yyyy-mm */
  month: string;
  date: string;
  state: 'draft' | 'posted' | 'paid';
  payslips: Payslip[];
  moveId?: ID;
  paymentMoveId?: ID;
}

export interface CashClosing {
  id: ID;
  date: string;
  journalId: ID;
  expected: number;
  counted: number;
  difference: number;
  cardExpected: number;
  cardSettled: number;
  notes: string;
  moveId?: ID;
}

export type UserRole = 'admin' | 'accountant' | 'viewer';

export interface User {
  id: ID;
  username: string;
  name: string;
  role: UserRole;
  /** PBKDF2-HMAC-SHA256 of the password, hex. */
  passwordHash: string;
  salt: string;
  iterations: number;
  active: boolean;
  /** Set when an administrator assigns a temporary password. */
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  createdAt: string;
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
  /** ISO country code of the company, e.g. 'OM'. */
  country: string;
  companyNameAr: string;
  vatRegistered: boolean;
  receivableAccountId: ID;
  payableAccountId: ID;
  suspenseAccountId: ID;
  outstandingReceiptsAccountId: ID;
  outstandingPaymentsAccountId: ID;
  taxSettlementAccountId: ID;
  chequesReceivedAccountId: ID;
  chequesIssuedAccountId: ID;
  cardClearingAccountId: ID;
  cashDifferenceAccountId: ID;
  salaryExpenseAccountId: ID;
  siExpenseAccountId: ID;
  salariesPayableAccountId: ID;
  siPayableAccountId: ID;
  employeeAdvancesAccountId: ID;
  /** Social insurance rates in percent of gross salary. */
  siEmployeeRate: number;
  siEmployerRate: number;
  defaultSaleTaxId?: ID;
  defaultPurchaseTaxId?: ID;
  defaultPaymentTermId?: ID;
  /** Company stamp printed on issued documents: none, drawn from the company name, or an uploaded image. */
  stampMode?: 'none' | 'generated' | 'image';
  /** Uploaded stamp as a data URI. */
  stampImage?: string;
  /** Authorised signature as a data URI (an uploaded image or a drawn SVG). */
  signatureImage?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  /** Where the stamp and signature are printed. Every switch defaults to on. */
  brandSales?: boolean;
  brandVouchers?: boolean;
  brandPurchases?: boolean;
  /** Reports, VAT return, salary sheet and payment reminders. */
  brandReports?: boolean;
  brandDrafts?: boolean;
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
  budgets: Budget[];
  employees: Employee[];
  payrollRuns: PayrollRun[];
  cashClosings: CashClosing[];
  users: User[];
  sequences: Record<string, number>;
}

export type CollectionName = Exclude<keyof AppState, 'settings' | 'sequences'>;

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingError';
  }
}
