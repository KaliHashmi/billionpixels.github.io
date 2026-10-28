import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useBooks } from '../../data/store';
import { MenuItem, Screen, SectionTitle } from '../../ui/components';

export default function CustomersMenu() {
  const s = useBooks();
  const drafts = useMemo(() => s.moves.filter((m) => m.moveType === 'out_invoice' && m.state === 'draft').length, [s.moves]);
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>Customers</SectionTitle>
      </View>
      <MenuItem icon="document-text-outline" title="Invoices" count={drafts} onPress={() => router.push({ pathname: '/moves', params: { type: 'out_invoice' } })} />
      <MenuItem icon="return-down-back-outline" title="Credit Notes" onPress={() => router.push({ pathname: '/moves', params: { type: 'out_refund' } })} />
      <MenuItem icon="cash-outline" title="Payments" onPress={() => router.push({ pathname: '/payments', params: { partnerType: 'customer' } })} />
      <MenuItem icon="alarm-outline" title="Follow-up" subtitle="Overdue invoices & reminders" onPress={() => router.push('/followups')} />
      <MenuItem icon="cube-outline" title="Products" onPress={() => router.push('/config/products')} />
      <MenuItem icon="people-outline" title="Customers" onPress={() => router.push({ pathname: '/config/[entity]', params: { entity: 'partners', kind: 'customer' } })} />
    </Screen>
  );
}
