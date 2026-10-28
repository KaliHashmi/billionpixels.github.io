import { router } from 'expo-router';
import { View } from 'react-native';
import { useT } from '../../i18n';
import { IconName, MenuItem, Screen, SectionTitle } from '../../ui/components';

type Item = [id: string, label: string, icon: IconName, preset?: string];

const WEEKLY: Item[] = [
  ['customer-outstanding', 'Customer Outstanding', 'people-outline', 'this_week'],
  ['supplier-outstanding', 'Supplier Outstanding', 'business-outline', 'this_week'],
  ['cash-position', 'Bank & Cash Balance', 'wallet-outline', 'this_week'],
  ['pending', 'Pending Collections & Payments', 'hourglass-outline', 'this_week'],
  ['unallocated', 'Unallocated Receipts & Payments', 'help-circle-outline', 'this_week'],
  ['cheques', 'Cheques Issued, Received & Pending', 'card-outline', 'this_week'],
];
const MONTHLY: Item[] = [
  ['profit-loss', 'Profit and Loss', 'trending-up-outline', 'this_month'],
  ['balance-sheet', 'Balance Sheet', 'scale-outline', 'this_month'],
  ['cash-flow', 'Cash Flow Statement', 'water-outline', 'this_month'],
  ['bank-reconciliation', 'Bank Reconciliation', 'git-compare-outline', 'this_month'],
  ['customer-outstanding', 'Customer Outstanding', 'people-outline', 'this_month'],
  ['supplier-outstanding', 'Supplier Outstanding', 'business-outline', 'this_month'],
  ['vat', 'VAT Report', 'document-attach-outline', 'this_month'],
  ['expenses', 'Expense Report', 'pricetags-outline', 'this_month'],
  ['budget', 'Budget vs. Actual', 'stats-chart-outline', 'this_month'],
  ['payroll', 'Payroll Report', 'people-circle-outline', 'this_month'],
];
const AUDIT: Item[] = [
  ['executive-summary', 'Executive Summary', 'briefcase-outline'],
  ['general-ledger', 'General Ledger', 'book-outline'],
  ['trial-balance', 'Trial Balance', 'grid-outline'],
  ['journal-audit', 'Journal Audit', 'search-outline'],
  ['partner-ledger', 'Partner Ledger', 'people-outline'],
  ['aged-receivable', 'Aged Receivable', 'hourglass-outline'],
  ['aged-payable', 'Aged Payable', 'hourglass-outline'],
  ['analytic', 'Analytic Report', 'pie-chart-outline'],
];

export default function ReportsMenu() {
  const { t } = useT();
  const section = (title: string, items: Item[]) => (
    <>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>{t(title)}</SectionTitle>
      </View>
      {items.map(([id, label, icon, preset]) => (
        <MenuItem key={`${title}-${id}`} icon={icon} title={t(label)} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: id, preset } })} />
      ))}
    </>
  );
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      {section('Weekly Reports', WEEKLY)}
      {section('Monthly Reports for the Owner', MONTHLY)}
      {section('Accounting Reports', AUDIT)}
    </Screen>
  );
}
