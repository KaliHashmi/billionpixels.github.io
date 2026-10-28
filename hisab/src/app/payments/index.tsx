import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../../data/store';
import { PAYMENT_METHOD_LABELS } from '../../domain/engine';
import { useT } from '../../i18n';
import { Badge, EmptyState, Fab, ListItem, SearchBar } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function PaymentsList() {
  const { partnerType = 'customer' } = useLocalSearchParams<{ partnerType?: 'customer' | 'supplier' }>();
  const s = useBooks();
  const { partners } = useLookups();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const [q, setQ] = useState('');
  const rows = useMemo(
    () => s.payments.filter((p) => p.partnerType === partnerType).sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name)),
    [s.payments, partnerType],
  );
  const term = q.trim().toLowerCase();
  const visible = rows.filter((p) => !term || p.name.toLowerCase().includes(term) || p.memo.toLowerCase().includes(term) || p.chequeNumber?.includes(term) || (p.partnerId && partners.get(p.partnerId)?.name.toLowerCase().includes(term)));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t(partnerType === 'customer' ? 'Customer Receipts' : 'Supplier Payments') }} />
      <View style={{ padding: space.md }}>
        <SearchBar value={q} onChangeText={setQ} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon="cash-outline" title={t('No payments yet')} />}
        renderItem={({ item: p }) => (
          <ListItem
            title={`${p.name}${p.partnerId ? ` · ${partners.get(p.partnerId)?.name ?? ''}` : ''}`}
            subtitle={[fmtDate(p.date), t(PAYMENT_METHOD_LABELS[p.method]), p.chequeNumber ? `#${p.chequeNumber}` : ''].filter(Boolean).join(' · ')}
            right={`${p.paymentType === 'inbound' ? '+' : '-'}${money(p.amount)}`}
            badge={p.state === 'cancel' ? <Badge label={t(p.bounced ? 'Bounced' : 'Cancelled')} tone="cancel" /> : undefined}
            onPress={() => router.push({ pathname: '/payments/[id]', params: { id: p.id } })}
          />
        )}
      />
      <Fab onPress={() => router.push({ pathname: '/payments/new', params: { partnerType } })} />
    </View>
  );
}
