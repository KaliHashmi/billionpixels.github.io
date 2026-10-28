import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../../data/store';
import { formatDate } from '../../domain/utils';
import { Badge, EmptyState, Fab, ListItem, SearchBar } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function PaymentsList() {
  const { partnerType = 'customer' } = useLocalSearchParams<{ partnerType?: 'customer' | 'supplier' }>();
  const s = useBooks();
  const { partners, journals } = useLookups();
  const money = useMoney();
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => s.payments.filter((p) => p.partnerType === partnerType).sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name)),
    [s.payments, partnerType],
  );
  const term = q.trim().toLowerCase();
  const visible = rows.filter((p) => !term || p.name.toLowerCase().includes(term) || p.memo.toLowerCase().includes(term) || (p.partnerId && partners.get(p.partnerId)?.name.toLowerCase().includes(term)));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: partnerType === 'customer' ? 'Customer Payments' : 'Vendor Payments' }} />
      <View style={{ padding: space.md }}>
        <SearchBar value={q} onChangeText={setQ} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon="cash-outline" title="No payments yet" />}
        renderItem={({ item: p }) => (
          <ListItem
            title={p.name}
            subtitle={[p.partnerId ? partners.get(p.partnerId)?.name : '', formatDate(p.date), journals.get(p.journalId)?.name].filter(Boolean).join(' · ')}
            right={`${p.paymentType === 'inbound' ? '+' : '-'}${money(p.amount)}`}
            badge={p.state === 'cancel' ? <Badge label="Cancelled" tone="cancel" /> : <Badge label={p.paymentType === 'inbound' ? 'Received' : 'Sent'} tone="posted" />}
            onPress={() => router.push({ pathname: '/payments/[id]', params: { id: p.id } })}
          />
        )}
      />
      <Fab onPress={() => router.push({ pathname: '/payments/new', params: { partnerType } })} />
    </View>
  );
}
