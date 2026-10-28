import { ACCOUNT_TYPE_LABELS } from '../domain/template';
import {
  Account,
  AccountType,
  AnalyticAccount,
  AppState,
  CollectionName,
  Employee,
  Journal,
  Partner,
  PaymentTerm,
  Product,
  Tax,
  VatCategory,
} from '../domain/types';
import { newId } from '../domain/utils';
import { IconName } from '../ui/components';
import { Option } from '../ui/fields';

/** Translation function (identity when not needed). */
export type Tr = (key: string) => string;
const id: Tr = (k) => k;

export const JOURNAL_TYPE_LABELS: Record<Journal['type'], string> = { sale: 'Sales', purchase: 'Purchase', bank: 'Bank', cash: 'Cash', general: 'Miscellaneous' };

export const VAT_CATEGORY_LABELS: Record<VatCategory, string> = {
  standard: 'Standard rate',
  zero: 'Zero-rated',
  exempt: 'Exempt',
  out_of_scope: 'Out of scope',
  reverse_charge: 'Reverse charge',
  import: 'Import of goods',
};

export type FieldType = 'text' | 'multiline' | 'number' | 'bool' | 'select' | 'multi';

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: (s: AppState, t: Tr) => Option[];
  keyboard?: 'email-address' | 'phone-pad' | 'default';
  section?: string;
}

export interface EntityDef<T extends { id: string; active: boolean }> {
  collection: CollectionName;
  title: string;
  singular: string;
  icon: IconName;
  fields: FieldDef<T>[];
  create: (s: AppState, params: Record<string, string | undefined>) => T;
  display: (rec: T, t?: Tr) => string;
  subtitle?: (rec: T, s: AppState, t: Tr) => string;
  validate?: (rec: T, s: AppState) => string | undefined;
  listFilter?: (rec: T, params: Record<string, string | undefined>) => boolean;
  sort?: (a: T, b: T) => number;
}

export const accountOptions = (s: AppState, filter?: (a: Account) => boolean, tr: Tr = id): Option[] =>
  s.accounts
    .filter((a) => a.active && (!filter || filter(a)))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ value: a.id, label: `${a.code} ${tr(a.name)}`, hint: tr(ACCOUNT_TYPE_LABELS[a.type]) }));

export const taxOptions = (s: AppState, use?: 'sale' | 'purchase', tr: Tr = id): Option[] =>
  s.taxes.filter((t) => t.active && (!use || t.typeTaxUse === use)).map((t) => ({ value: t.id, label: tr(t.name) }));

export const partnerOptions = (s: AppState, kind?: 'customer' | 'supplier'): Option[] =>
  s.partners
    .filter((p) => p.active && (!kind || (kind === 'customer' ? p.isCustomer : p.isVendor)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name, hint: p.email || p.city }));

export const journalOptions = (s: AppState, types?: Journal['type'][], tr: Tr = id): Option[] =>
  s.journals.filter((j) => j.active && (!types || types.includes(j.type))).map((j) => ({ value: j.id, label: `${tr(j.name)} (${j.code})` }));

export const termOptions = (s: AppState, tr: Tr = id): Option[] => s.paymentTerms.filter((t) => t.active).map((t) => ({ value: t.id, label: tr(t.name) }));

const accountTypeOptions = (tr: Tr): Option[] => (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({ value: t, label: tr(ACCOUNT_TYPE_LABELS[t]) }));

const opts = (tr: Tr, pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label: tr(label) }));

const accounts: EntityDef<Account> = {
  collection: 'accounts',
  title: 'Chart of Accounts',
  singular: 'Account',
  icon: 'list-outline',
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true },
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', required: true, options: (_s, t) => accountTypeOptions(t) },
    { key: 'reconcile', label: 'Allow Reconciliation', type: 'bool', hint: 'Journal items can be matched (receivables, payables, transfers…)' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), code: '', name: '', type: 'expense', reconcile: false, active: true }),
  display: (a, t = id) => `${a.code} ${t(a.name)}`,
  subtitle: (a, _s, t) => t(ACCOUNT_TYPE_LABELS[a.type]),
  validate: (a, s) => {
    if (!/^[0-9A-Za-z.]+$/.test(a.code)) return 'The account code may only contain letters, digits and dots.';
    if (s.accounts.some((x) => x.code === a.code && x.id !== a.id)) return `Account code ${a.code} already exists.`;
  },
  sort: (a, b) => a.code.localeCompare(b.code),
};

const journals: EntityDef<Journal> = {
  collection: 'journals',
  title: 'Journals',
  singular: 'Journal',
  icon: 'book-outline',
  fields: [
    { key: 'name', label: 'Journal Name', type: 'text', required: true },
    { key: 'code', label: 'Short Code', type: 'text', required: true, hint: 'Used as sequence prefix, e.g. INV' },
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      required: true,
      options: (_s, t) => opts(t, [['sale', 'Sales'], ['purchase', 'Purchase'], ['bank', 'Bank'], ['cash', 'Cash'], ['general', 'Miscellaneous']]),
    },
    { key: 'defaultAccountId', label: 'Default Account', type: 'select', options: (s, t) => accountOptions(s, undefined, t), hint: 'Income/expense account, or the bank/cash account' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), name: '', code: '', type: 'bank', active: true }),
  display: (j, t = id) => t(j.name),
  subtitle: (j, _s, t) => `${j.code} · ${t(JOURNAL_TYPE_LABELS[j.type])}`,
  validate: (j, s) => {
    if (j.code.length > 5 || !/^[A-Za-z0-9]+$/.test(j.code)) return 'Short code must be 1-5 letters or digits.';
    if (s.journals.some((x) => x.code === j.code && x.id !== j.id)) return 'Journal code must be unique.';
    if ((j.type === 'bank' || j.type === 'cash') && !j.defaultAccountId) return 'Bank and cash journals need a default account.';
  },
};

const taxes: EntityDef<Tax> = {
  collection: 'taxes',
  title: 'Taxes',
  singular: 'Tax',
  icon: 'pricetag-outline',
  fields: [
    { key: 'name', label: 'Tax Name', type: 'text', required: true },
    { key: 'label', label: 'Label on Invoices', type: 'text' },
    { key: 'typeTaxUse', label: 'Tax Type', type: 'select', required: true, options: (_s, t) => opts(t, [['sale', 'Sales'], ['purchase', 'Purchases'], ['none', 'None']]) },
    { key: 'vatCategory', label: 'VAT Treatment', type: 'select', required: true, options: (_s, t) => opts(t, Object.entries(VAT_CATEGORY_LABELS)), hint: 'Determines the line of the VAT return' },
    { key: 'amountType', label: 'Tax Computation', type: 'select', required: true, options: (_s, t) => opts(t, [['percent', 'Percentage of price'], ['fixed', 'Fixed amount per unit']]) },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'priceInclude', label: 'Included in Price', type: 'bool' },
    { key: 'accountId', label: 'Tax Account', type: 'select', required: true, options: (s, t) => accountOptions(s, undefined, t) },
    { key: 'reverseCharge', label: 'Reverse Charge (self-assessed)', type: 'bool', hint: 'Imported services / deferred import VAT: you account for both input and output VAT' },
    { key: 'reverseAccountId', label: 'Output VAT Account (reverse charge)', type: 'select', options: (s, t) => accountOptions(s, undefined, t) },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: (s) => ({ id: newId(), name: '', label: '', typeTaxUse: 'sale', amountType: 'percent', amount: 0, priceInclude: false, accountId: s.accounts.find((a) => a.code === '251000')?.id ?? '', vatCategory: 'standard', reverseCharge: false, active: true }),
  display: (x, t = id) => t(x.name),
  subtitle: (x, _s, t) => `${t(VAT_CATEGORY_LABELS[x.vatCategory] ?? '')} · ${x.amountType === 'percent' ? `${x.amount}%` : x.amount}${x.priceInclude ? ` · ${t('included')}` : ''}`,
  validate: (x) => (x.reverseCharge && !x.reverseAccountId ? 'Choose the output VAT account for the reverse charge.' : undefined),
};

const paymentTerms: EntityDef<PaymentTerm> = {
  collection: 'paymentTerms',
  title: 'Payment Terms',
  singular: 'Payment Term',
  icon: 'time-outline',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'days', label: 'Days after invoice date', type: 'number', required: true },
    { key: 'endOfMonth', label: 'End of month', type: 'bool', hint: 'Due at the end of the month after adding the days' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), name: '', days: 30, endOfMonth: false, active: true }),
  display: (x, t = id) => t(x.name),
  subtitle: (x, _s, t) => `${x.days} ${t('days')}${x.endOfMonth ? `, ${t('end of month')}` : ''}`,
  validate: (t) => (t.days < 0 ? 'Days cannot be negative.' : undefined),
};

const analyticAccounts: EntityDef<AnalyticAccount> = {
  collection: 'analyticAccounts',
  title: 'Analytic Accounts',
  singular: 'Analytic Account',
  icon: 'pie-chart-outline',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'code', label: 'Reference', type: 'text' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), name: '', code: '', active: true }),
  display: (a) => a.name,
  subtitle: (a) => a.code,
};

const products: EntityDef<Product> = {
  collection: 'products',
  title: 'Products',
  singular: 'Product',
  icon: 'cube-outline',
  fields: [
    { key: 'name', label: 'Product Name', type: 'text', required: true },
    { key: 'internalRef', label: 'Internal Reference', type: 'text' },
    { key: 'type', label: 'Product Type', type: 'select', required: true, options: (_s, t) => opts(t, [['service', 'Service'], ['consu', 'Goods']]) },
    { key: 'salePrice', label: 'Sales Price', type: 'number', section: 'Sales' },
    { key: 'saleTaxIds', label: 'Customer Taxes', type: 'multi', options: (s, t) => taxOptions(s, 'sale', t), section: 'Sales' },
    { key: 'incomeAccountId', label: 'Income Account', type: 'select', options: (s, t) => accountOptions(s, (a) => a.type.startsWith('income'), t), section: 'Sales' },
    { key: 'cost', label: 'Cost', type: 'number', section: 'Purchase' },
    { key: 'purchaseTaxIds', label: 'Vendor Taxes', type: 'multi', options: (s, t) => taxOptions(s, 'purchase', t), section: 'Purchase' },
    { key: 'expenseAccountId', label: 'Expense Account', type: 'select', options: (s, t) => accountOptions(s, (a) => a.type.startsWith('expense') || a.type.startsWith('asset'), t), section: 'Purchase' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: (s) => ({
    id: newId(),
    name: '',
    internalRef: '',
    type: 'service',
    salePrice: 0,
    cost: 0,
    saleTaxIds: s.settings.defaultSaleTaxId ? [s.settings.defaultSaleTaxId] : [],
    purchaseTaxIds: s.settings.defaultPurchaseTaxId ? [s.settings.defaultPurchaseTaxId] : [],
    active: true,
  }),
  display: (p) => (p.internalRef ? `[${p.internalRef}] ${p.name}` : p.name),
  subtitle: (p, s, t) => `${t(p.type === 'service' ? 'Service' : 'Goods')} · ${s.settings.currencySymbol} ${p.salePrice}`,
  sort: (a, b) => a.name.localeCompare(b.name),
};

const partners: EntityDef<Partner> = {
  collection: 'partners',
  title: 'Contacts',
  singular: 'Contact',
  icon: 'people-outline',
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'text', keyboard: 'email-address' },
    { key: 'phone', label: 'Phone', type: 'text', keyboard: 'phone-pad' },
    { key: 'street', label: 'Street', type: 'text', section: 'Address' },
    { key: 'city', label: 'City', type: 'text', section: 'Address' },
    { key: 'country', label: 'Country', type: 'text', section: 'Address' },
    { key: 'taxId', label: 'VAT Registration Number (VATIN)', type: 'text', section: 'Accounting', hint: 'Required on tax invoices to VAT-registered customers' },
    { key: 'isCustomer', label: 'Customer', type: 'bool', section: 'Accounting' },
    { key: 'isVendor', label: 'Vendor', type: 'bool', section: 'Accounting' },
    { key: 'paymentTermId', label: 'Payment Terms', type: 'select', options: (s, t) => termOptions(s, t), section: 'Accounting' },
    { key: 'notes', label: 'Internal Notes', type: 'multiline' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: (_s, params) => ({
    id: newId(),
    name: params.name ?? '',
    email: '',
    phone: '',
    street: '',
    city: '',
    country: '',
    taxId: '',
    isCustomer: params.kind !== 'supplier',
    isVendor: params.kind === 'supplier',
    notes: '',
    active: true,
  }),
  display: (p) => p.name,
  subtitle: (p) => [p.email, p.city].filter(Boolean).join(' · '),
  listFilter: (p, params) => (params.kind === 'customer' ? p.isCustomer : params.kind === 'supplier' ? p.isVendor : true),
  validate: (p) => (p.email && !/^\S+@\S+\.\S+$/.test(p.email) ? 'Invalid email address.' : undefined),
  sort: (a, b) => a.name.localeCompare(b.name),
};

const employees: EntityDef<Employee> = {
  collection: 'employees',
  title: 'Employees',
  singular: 'Employee',
  icon: 'id-card-outline',
  fields: [
    { key: 'name', label: 'Employee Name', type: 'text', required: true },
    { key: 'code', label: 'Employee ID', type: 'text' },
    { key: 'position', label: 'Job Position', type: 'text' },
    { key: 'nationality', label: 'Nationality', type: 'select', required: true, options: (_s, t) => opts(t, [['omani', 'Omani'], ['expat', 'Expatriate']]) },
    { key: 'joinDate', label: 'Joining Date (YYYY-MM-DD)', type: 'text' },
    { key: 'basicSalary', label: 'Basic Salary', type: 'number', required: true, section: 'Salary' },
    { key: 'housingAllowance', label: 'Housing Allowance', type: 'number', section: 'Salary' },
    { key: 'transportAllowance', label: 'Transport Allowance', type: 'number', section: 'Salary' },
    { key: 'otherAllowance', label: 'Other Allowances', type: 'number', section: 'Salary' },
    { key: 'socialInsurance', label: 'Social Insurance', type: 'bool', section: 'Salary', hint: 'Omani employees registered with the Social Protection Fund' },
    { key: 'bankName', label: 'Bank', type: 'text', section: 'Salary Transfer (WPS)' },
    { key: 'iban', label: 'IBAN / Account Number', type: 'text', section: 'Salary Transfer (WPS)' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({
    id: newId(),
    name: '',
    code: '',
    position: '',
    nationality: 'omani',
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowance: 0,
    socialInsurance: true,
    bankName: '',
    iban: '',
    joinDate: '',
    active: true,
  }),
  display: (e) => e.name,
  subtitle: (e, s, t) => [e.position, t(e.nationality === 'omani' ? 'Omani' : 'Expatriate'), `${s.settings.currencySymbol} ${e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowance}`].filter(Boolean).join(' · '),
  validate: (e) => (e.basicSalary <= 0 ? 'Basic salary must be positive.' : e.joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(e.joinDate) ? 'Invalid date.' : undefined),
  sort: (a, b) => a.name.localeCompare(b.name),
};

export const ENTITIES: Record<string, EntityDef<any>> = {
  employees,
  accounts,
  journals,
  taxes,
  paymentTerms,
  analyticAccounts,
  products,
  partners,
};

/** Whether a record id is used anywhere in the books (then it can only be archived). */
export function isReferenced(s: AppState, collection: CollectionName, id: string): boolean {
  const haystacks: unknown[] = [s.settings, s.moves, s.payments, s.statementLines, s.assets, s.products, s.taxes, s.journals, s.partners];
  const needle = `"${id}"`;
  return haystacks.some((h) => {
    const json = JSON.stringify(h);
    // Ignore the record's own "id" field.
    return json.split(needle).length - 1 > (Array.isArray(h) && (s[collection] as unknown) === h ? 1 : 0);
  });
}
