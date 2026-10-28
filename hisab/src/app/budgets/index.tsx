import { router, Stack } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { useT } from '../../i18n';
import { Badge, EmptyState, Fab, ListItem } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function BudgetsList() {
  const s = useBooks();
  const money = useMoney();
  const { t } = useT();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Budgets') }} />
      <FlatList
        data={s.budgets}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<EmptyState icon="trending-up-outline" title={t('No budgets')} message={t('Plan a monthly amount per income or expense account, then compare it with actual results.')} />}
        renderItem={({ item: b }) => (
          <ListItem
            title={b.name}
            subtitle={`${b.lines.length} ${t('accounts')}`}
            right={`${money(b.lines.reduce((x, l) => x + l.monthly, 0))} / ${t('month')}`}
            badge={!b.active ? <Badge label={t('Archived')} tone="draft" /> : undefined}
            onPress={() => router.push({ pathname: '/budgets/[id]', params: { id: b.id } })}
          />
        )}
      />
      <Fab onPress={() => router.push({ pathname: '/budgets/[id]', params: { id: 'new' } })} />
    </View>
  );
}
