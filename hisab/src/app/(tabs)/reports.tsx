import { router } from 'expo-router';
import { View } from 'react-native';
import { IconName, MenuItem, Screen, SectionTitle } from '../../ui/components';

const STATEMENTS: [string, string, IconName][] = [
  ['profit-loss', 'Profit and Loss', 'trending-up-outline'],
  ['balance-sheet', 'Balance Sheet', 'scale-outline'],
  ['cash-flow', 'Cash Flow Statement', 'water-outline'],
  ['executive-summary', 'Executive Summary', 'briefcase-outline'],
];
const AUDIT: [string, string, IconName][] = [
  ['general-ledger', 'General Ledger', 'book-outline'],
  ['trial-balance', 'Trial Balance', 'grid-outline'],
  ['journal-audit', 'Journal Audit', 'search-outline'],
];
const PARTNER: [string, string, IconName][] = [
  ['partner-ledger', 'Partner Ledger', 'people-outline'],
  ['aged-receivable', 'Aged Receivable', 'hourglass-outline'],
  ['aged-payable', 'Aged Payable', 'hourglass-outline'],
];
const MGMT: [string, string, IconName][] = [['analytic', 'Analytic Report', 'pie-chart-outline']];

export default function ReportsMenu() {
  const section = (title: string, items: [string, string, IconName][]) => (
    <>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>{title}</SectionTitle>
      </View>
      {items.map(([id, label, icon]) => (
        <MenuItem key={id} icon={icon} title={label} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: id } })} />
      ))}
    </>
  );
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      {section('Statement Reports', STATEMENTS)}
      {section('Audit Reports', AUDIT)}
      {section('Partner Reports', PARTNER)}
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>Taxes</SectionTitle>
      </View>
      <MenuItem icon="document-attach-outline" title="Tax Report" onPress={() => router.push('/tax-return')} />
      {section('Management', MGMT)}
    </Screen>
  );
}
