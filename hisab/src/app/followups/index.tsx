import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { agedBalance } from '../../domain/reports';
import { today } from '../../domain/utils';
import { useT } from '../../i18n';
import { Badge, EmptyState, ListItem } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function FollowUps() {
  const s = useBooks();
  const money = useMoney();
  const { t } = useT();
  const rows = useMemo(() => agedBalance(s, 'receivable', today()).rows.filter((r) => r.partnerId && r.total > 0), [s]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Follow-up') }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.partnerId!}
        ListEmptyComponent={<EmptyState icon="happy-outline" title={t('Nothing to follow up')} message={t('No customer owes you money.')} />}
        renderItem={({ item: r }) => {
          const overdue = r.total - r.buckets[0];
          const oldest = Math.max(0, ...r.items.map((i) => i.days));
          return (
            <ListItem
              title={r.partner?.name ?? t('Unknown')}
              subtitle={overdue > 0 ? t('Overdue {amount} · oldest {days} days late', { amount: money(overdue), days: oldest }) : t('Not due yet')}
              right={money(r.total)}
              badge={overdue > 0 ? <Badge label={t(oldest > 60 ? 'Urgent' : 'Overdue')} tone="overdue" /> : <Badge label={t('In time')} tone="posted" />}
              onPress={() => router.push({ pathname: '/followups/[id]', params: { id: r.partnerId! } })}
            />
          );
        }}
      />
    </View>
  );
}
