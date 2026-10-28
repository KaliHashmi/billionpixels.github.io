import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../data/store';
import { lineResidual } from '../domain/engine';
import { postedItems } from '../domain/reports';
import { formatDate, isZero } from '../domain/utils';
import { accountOptions } from '../features/entities';
import { Badge, Chips, EmptyState, ListItem, SearchBar } from '../ui/components';
import { SelectField } from '../ui/fields';
import { colors, space } from '../ui/theme';

export default function JournalItemsScreen() {
  const s = useBooks();
  const lk = useLookups();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [filter, setFilter] = useState<'all' | 'unreconciled'>('all');
  const items = useMemo(() => postedItems(s).reverse(), [s]);
  const term = q.trim().toLowerCase();
  const visible = items.filter((it) => {
    if (accountId && it.account.id !== accountId) return false;
    if (filter === 'unreconciled' && (!it.account.reconcile || isZero(lineResidual(it.line, lk.reconcileIndex, s.settings.decimals), s.settings.decimals))) return false;
    if (!term) return true;
    return (
      it.move.name.toLowerCase().includes(term) ||
      it.line.label.toLowerCase().includes(term) ||
      it.account.code.includes(term) ||
      (it.line.partnerId ? lk.partners.get(it.line.partnerId)?.name.toLowerCase().includes(term) : false)
    );
  });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Journal Items' }} />
      <View style={{ padding: space.md, gap: space.sm }}>
        <SearchBar value={q} onChangeText={setQ} />
        <SelectField label="Account" value={accountId} options={accountOptions(s)} onChange={setAccountId} placeholder="All accounts" />
        <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unreconciled', label: 'Unreconciled' }]} />
      </View>
      <FlatList
        data={visible.slice(0, 500)}
        keyExtractor={(it) => it.line.id}
        ListEmptyComponent={<EmptyState title="No journal items" />}
        renderItem={({ item: it }) => {
          const residual = it.account.reconcile ? lineResidual(it.line, lk.reconcileIndex, s.settings.decimals) : 0;
          return (
            <ListItem
              title={`${it.account.code} ${it.account.name}`}
              subtitle={[it.move.name, formatDate(it.move.date), it.line.partnerId ? lk.partners.get(it.line.partnerId)?.name : '', it.line.label].filter(Boolean).join(' · ')}
              right={it.line.debit ? `Dr ${money(it.line.debit, false)}` : `Cr ${money(it.line.credit, false)}`}
              badge={it.account.reconcile ? (isZero(residual) ? <Badge label="Matched" tone="reconciled" /> : <Badge label="Open" tone="to_reconcile" />) : undefined}
              onPress={() => router.push({ pathname: '/moves/[id]', params: { id: it.move.id } })}
            />
          );
        }}
      />
    </View>
  );
}
