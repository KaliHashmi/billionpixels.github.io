import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useMoney } from '../data/store';
import { chequeRegister } from '../domain/management';
import { round } from '../domain/utils';
import { useT } from '../i18n';
import { Badge, Card, Chips, EmptyState, ListItem, Row } from '../ui/components';
import { colors, space } from '../ui/theme';

const LABELS = { pending: 'Pending Clearance', cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled' };

export default function ChequesScreen() {
  const s = useBooks();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const [dir, setDir] = useState<'received' | 'issued'>('received');
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const all = useMemo(() => chequeRegister(s), [s]);
  const rows = all.filter((c) => c.direction === dir && (status === 'all' || c.status === 'pending'));
  const pendingTotal = (d: 'received' | 'issued') => round(all.filter((c) => c.direction === d && c.status === 'pending').reduce((x, c) => x + c.payment.amount, 0), s.settings.decimals);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Cheques') }} />
      <FlatList
        data={rows}
        keyExtractor={(c) => c.payment.id}
        ListHeaderComponent={
          <View style={{ padding: space.md, gap: space.sm }}>
            <Card>
              <Row label={t('Cheques received – pending clearance')} value={money(pendingTotal('received'))} />
              <Row label={t('Cheques issued – pending clearance')} value={money(pendingTotal('issued'))} />
            </Card>
            <Chips value={dir} onChange={setDir} options={[{ value: 'received', label: t('Received') }, { value: 'issued', label: t('Issued') }]} />
            <Chips value={status} onChange={setStatus} options={[{ value: 'pending', label: t('Pending Clearance') }, { value: 'all', label: t('All') }]} />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="card-outline" title={t('No cheques')} />}
        renderItem={({ item: c }) => (
          <ListItem
            title={`#${c.payment.chequeNumber ?? ''} · ${c.partner?.name ?? ''}`}
            subtitle={[`${t('Cheque Date')} ${fmtDate(c.payment.chequeDate)}`, c.payment.chequeBank, c.payment.name].filter(Boolean).join(' · ')}
            right={money(c.payment.amount)}
            badge={<Badge label={t(LABELS[c.status])} tone={c.status === 'cancelled' ? 'cancel' : c.status} />}
            onPress={() => router.push({ pathname: '/payments/[id]', params: { id: c.payment.id } })}
          />
        )}
      />
    </View>
  );
}
