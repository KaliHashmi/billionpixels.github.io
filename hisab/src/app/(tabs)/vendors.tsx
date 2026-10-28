import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useBooks } from '../../data/store';
import { MenuItem, Screen, SectionTitle } from '../../ui/components';

export default function VendorsMenu() {
  const s = useBooks();
  const drafts = useMemo(() => s.moves.filter((m) => m.moveType === 'in_invoice' && m.state === 'draft').length, [s.moves]);
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>Vendors</SectionTitle>
      </View>
      <MenuItem icon="receipt-outline" title="Bills" count={drafts} onPress={() => router.push({ pathname: '/moves', params: { type: 'in_invoice' } })} />
      <MenuItem icon="return-up-forward-outline" title="Refunds" onPress={() => router.push({ pathname: '/moves', params: { type: 'in_refund' } })} />
      <MenuItem icon="card-outline" title="Payments" onPress={() => router.push({ pathname: '/payments', params: { partnerType: 'supplier' } })} />
      <MenuItem icon="cube-outline" title="Products" onPress={() => router.push('/config/products')} />
      <MenuItem icon="business-outline" title="Vendors" onPress={() => router.push({ pathname: '/config/[entity]', params: { entity: 'partners', kind: 'supplier' } })} />
    </Screen>
  );
}
