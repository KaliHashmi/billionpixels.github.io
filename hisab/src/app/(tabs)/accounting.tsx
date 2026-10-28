import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useBooks } from '../../data/store';
import { MenuItem, Screen, SectionTitle } from '../../ui/components';

export default function AccountingMenu() {
  const s = useBooks();
  const toReconcile = useMemo(() => s.statementLines.filter((l) => !l.reconciled).length, [s.statementLines]);
  const bank = s.journals.find((j) => j.type === 'bank' && j.active);
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>Accounting</SectionTitle>
      </View>
      <MenuItem icon="git-compare-outline" title="Bank Reconciliation" count={toReconcile} onPress={() => router.push({ pathname: '/bank', params: { journalId: bank?.id } })} />
      <MenuItem icon="journal-outline" title="Journal Entries" onPress={() => router.push({ pathname: '/moves', params: { type: 'entry' } })} />
      <MenuItem icon="reorder-four-outline" title="Journal Items" onPress={() => router.push('/items')} />
      <MenuItem icon="car-outline" title="Assets" subtitle="Fixed assets & depreciation" onPress={() => router.push('/assets')} />
      <MenuItem icon="document-attach-outline" title="Tax Return" subtitle="VAT report & tax closing" onPress={() => router.push('/tax-return')} />
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>Configuration</SectionTitle>
      </View>
      <MenuItem icon="list-outline" title="Chart of Accounts" onPress={() => router.push('/config/accounts')} />
      <MenuItem icon="book-outline" title="Journals" onPress={() => router.push('/config/journals')} />
      <MenuItem icon="pricetag-outline" title="Taxes" onPress={() => router.push('/config/taxes')} />
      <MenuItem icon="time-outline" title="Payment Terms" onPress={() => router.push('/config/paymentTerms')} />
      <MenuItem icon="pie-chart-outline" title="Analytic Accounts" onPress={() => router.push('/config/analyticAccounts')} />
      <MenuItem icon="settings-outline" title="Settings" subtitle="Company, lock dates, backup & restore" onPress={() => router.push('/settings')} />
    </Screen>
  );
}
