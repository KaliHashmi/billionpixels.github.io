import { ACCOUNT_TYPE_LABELS } from '../domain/template';
import {
  Account,
  AccountType,
  AnalyticAccount,
  AppState,
  CollectionName,
  Journal,
  Partner,
  PaymentTerm,
  Product,
  Tax,
} from '../domain/types';
import { newId } from '../domain/utils';
import { IconName } from '../ui/components';
import { Option } from '../ui/fields';

export type FieldType = 'text' | 'multiline' | 'number' | 'bool' | 'select' | 'multi';

export interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: (s: AppState) => Option[];
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
  display: (rec: T) => string;
  subtitle?: (rec: T, s: AppState) => string;
  validate?: (rec: T, s: AppState) => string | undefined;
  listFilter?: (rec: T, params: Record<string, string | undefined>) => boolean;
  sort?: (a: T, b: T) => number;
}

export const accountOptions = (s: AppState, filter?: (a: Account) => boolean): Option[] =>
  s.accounts
    .filter((a) => a.active && (!filter || filter(a)))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ value: a.id, label: `${a.code} ${a.name}`, hint: ACCOUNT_TYPE_LABELS[a.type] }));

export const taxOptions = (s: AppState, use?: 'sale' | 'purchase'): Option[] =>
  s.taxes.filter((t) => t.active && (!use || t.typeTaxUse === use)).map((t) => ({ value: t.id, label: t.name }));

export const partnerOptions = (s: AppState, kind?: 'customer' | 'supplier'): Option[] =>
  s.partners
    .filter((p) => p.active && (!kind || (kind === 'customer' ? p.isCustomer : p.isVendor)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name, hint: p.email || p.city }));

export const journalOptions = (s: AppState, types?: Journal['type'][]): Option[] =>
  s.journals.filter((j) => j.active && (!types || types.includes(j.type))).map((j) => ({ value: j.id, label: `${j.name} (${j.code})` }));

const termOptions = (s: AppState): Option[] => s.paymentTerms.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }));

const accountTypeOptions: Option[] = (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

const accounts: EntityDef<Account> = {
  collection: 'accounts',
  title: 'Chart of Accounts',
  singular: 'Account',
  icon: 'list-outline',
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true },
    { key: 'name', label: 'Account Name', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', required: true, options: () => accountTypeOptions },
    { key: 'reconcile', label: 'Allow Reconciliation', type: 'bool', hint: 'Journal items can be matched (receivables, payables, transfers…)' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), code: '', name: '', type: 'expense', reconcile: false, active: true }),
  display: (a) => `${a.code} ${a.name}`,
  subtitle: (a) => ACCOUNT_TYPE_LABELS[a.type],
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
      options: () => [
        { value: 'sale', label: 'Sales' },
        { value: 'purchase', label: 'Purchase' },
        { value: 'bank', label: 'Bank' },
        { value: 'cash', label: 'Cash' },
        { value: 'general', label: 'Miscellaneous' },
      ],
    },
    { key: 'defaultAccountId', label: 'Default Account', type: 'select', options: (s) => accountOptions(s), hint: 'Income/expense account, or the bank/cash account' },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: () => ({ id: newId(), name: '', code: '', type: 'bank', active: true }),
  display: (j) => j.name,
  subtitle: (j) => `${j.code} · ${j.type}`,
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
    { key: 'typeTaxUse', label: 'Tax Type', type: 'select', required: true, options: () => [{ value: 'sale', label: 'Sales' }, { value: 'purchase', label: 'Purchases' }, { value: 'none', label: 'None' }] },
    { key: 'amountType', label: 'Tax Computation', type: 'select', required: true, options: () => [{ value: 'percent', label: 'Percentage of price' }, { value: 'fixed', label: 'Fixed amount per unit' }] },
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'priceInclude', label: 'Included in Price', type: 'bool' },
    { key: 'accountId', label: 'Tax Account', type: 'select', required: true, options: (s) => accountOptions(s) },
    { key: 'active', label: 'Active', type: 'bool' },
  ],
  create: (s) => ({ id: newId(), name: '', label: '', typeTaxUse: 'sale', amountType: 'percent', amount: 0, priceInclude: false, accountId: s.accounts.find((a) => a.code === '251000')?.id ?? '', active: true }),
  display: (t) => t.name,
  subtitle: (t) => `${t.typeTaxUse} · ${t.amountType === 'percent' ? `${t.amount}%` : t.amount}${t.priceInclude ? ' · included' : ''}`,
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
  display: (t) => t.name,
  subtitle: (t) => `${t.days} days${t.endOfMonth ? ', end of month' : ''}`,
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
    { key: 'type', label: 'Product Type', type: 'select', required: true, options: () => [{ value: 'service', label: 'Service' }, { value: 'consu', label: 'Goods' }] },
    { key: 'salePrice', label: 'Sales Price', type: 'number', section: 'Sales' },
    { key: 'saleTaxIds', label: 'Customer Taxes', type: 'multi', options: (s) => taxOptions(s, 'sale'), section: 'Sales' },
    { key: 'incomeAccountId', label: 'Income Account', type: 'select', options: (s) => accountOptions(s, (a) => a.type.startsWith('income')), section: 'Sales' },
    { key: 'cost', label: 'Cost', type: 'number', section: 'Purchase' },
    { key: 'purchaseTaxIds', label: 'Vendor Taxes', type: 'multi', options: (s) => taxOptions(s, 'purchase'), section: 'Purchase' },
    { key: 'expenseAccountId', label: 'Expense Account', type: 'select', options: (s) => accountOptions(s, (a) => a.type.startsWith('expense') || a.type.startsWith('asset')), section: 'Purchase' },
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
  subtitle: (p, s) => `${p.type === 'service' ? 'Service' : 'Goods'} · ${s.settings.currencySymbol} ${p.salePrice}`,
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
    { key: 'taxId', label: 'Tax ID / VAT', type: 'text', section: 'Accounting' },
    { key: 'isCustomer', label: 'Customer', type: 'bool', section: 'Accounting' },
    { key: 'isVendor', label: 'Vendor', type: 'bool', section: 'Accounting' },
    { key: 'paymentTermId', label: 'Payment Terms', type: 'select', options: termOptions, section: 'Accounting' },
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

export const ENTITIES: Record<string, EntityDef<any>> = {
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
