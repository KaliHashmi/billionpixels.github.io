import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../data/store';
import { PAYMENT_METHOD_LABELS } from '../domain/engine';
import { round } from '../domain/utils';
import { journalOptions } from '../features/entities';
import { useT } from '../i18n';
import { Badge, Button, ButtonRow, Card, Chips, EmptyState, ListItem, Row, SearchBar } from '../ui/components';
import { SelectField } from '../ui/fields';
import { colors, space } from '../ui/theme';

/** Every receipt and payment through a bank or cash journal, with running totals. */
export default function CashBook() {
  const params = useLocalSearchParams<{ journalId?: string }>();
  const s = useBooks();
  const lk = useLookups();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const liquidity = journalOptions(s, ['bank', 'cash'], t);
  const [journalId, setJournalId] = useState<string | undefined>(params.journalId);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [q, setQ] = useState('');
  const journal = journalId ? lk.journals.get(journalId) : undefined;

  const rows = useMemo(
    () =>
      s.payments
        .filter((p) => !journalId || p.journalId === journalId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name)),
    [s.payments, journalId],
  );
  const posted = rows.filter((p) => p.state === 'posted');
  const totalIn = round(posted.filter((p) => p.paymentType === 'inbound').reduce((x, p) => x + p.amount, 0), s.settings.decimals);
  const totalOut = round(posted.filter((p) => p.paymentType === 'outbound').reduce((x, p) => x + p.amount, 0), s.settings.decimals);
  const balance = useMemo(() => {
    const ids = new Set(s.journals.filter((j) => (journalId ? j.id === journalId : j.type === 'bank' || j.type === 'cash')).map((j) => j.defaultAccountId));
    let b = 0;
    for (const m of s.moves) if (m.state === 'posted') for (const l of m.lines) if (ids.has(l.accountId)) b += l.debit - l.credit;
    return round(b, s.settings.decimals);
  }, [s.moves, s.journals, journalId, s.settings.decimals]);

  const term = q.trim().toLowerCase();
  const visible = rows.filter(
    (p) =>
      (filter === 'all' || (filter === 'in' ? p.paymentType === 'inbound' : p.paymentType === 'outbound')) &&
      (!term || p.name.toLowerCase().includes(term) || p.memo.toLowerCase().includes(term) || (p.partnerId && lk.partners.get(p.partnerId)?.name.toLowerCase().includes(term))),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Cash & Bank Book') }} />
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ padding: space.md, gap: space.sm }}>
            <SelectField label={t('Bank / Cash')} value={journalId} options={liquidity} onChange={setJournalId} placeholder={t('All bank and cash journals')} />
            <Card>
              <Row label={t('Balance in books')} value={money(balance)} bold />
              <Row label={t('Total received')} value={money(totalIn)} valueStyle={{ color: colors.success }} />
              <Row label={t('Total paid')} value={money(totalOut)} valueStyle={{ color: colors.danger }} />
              <ButtonRow>
                <Button small title={t('Receive Money')} icon="arrow-down-circle-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'customer', direction: 'inbound', journalId } })} />
                <Button small title={t('Pay Money')} icon="arrow-up-circle-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'supplier', direction: 'outbound', journalId } })} />
                <Button small variant="secondary" title={t('Expense')} icon="wallet-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'other', direction: 'outbound', journalId } })} />
                <Button small variant="secondary" title={t('Other Income')} icon="add-circle-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'other', direction: 'inbound', journalId } })} />
                {journal?.type === 'bank' && <Button small variant="secondary" title={t('Reconcile')} icon="git-compare-outline" onPress={() => router.push({ pathname: '/bank', params: { journalId } })} />}
              </ButtonRow>
            </Card>
            <SearchBar value={q} onChangeText={setQ} />
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('All') },
                { value: 'in', label: t('Money In') },
                { value: 'out', label: t('Money Out') },
              ]}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="wallet-outline" title={t('No transactions')} />}
        renderItem={({ item: p }) => (
          <ListItem
            title={`${p.name} · ${p.partnerId ? lk.partners.get(p.partnerId)?.name ?? '' : t(lk.accounts.get(p.counterpartAccountId ?? '')?.name ?? '')}`}
            subtitle={[fmtDate(p.date), t(lk.journals.get(p.journalId)?.name ?? ''), p.method !== 'cash' ? t(PAYMENT_METHOD_LABELS[p.method]) : '', p.memo].filter(Boolean).join(' · ')}
            right={`${p.paymentType === 'inbound' ? '+' : '-'}${money(p.amount, false)}`}
            badge={p.state === 'cancel' ? <Badge label={t(p.bounced ? 'Bounced' : 'Cancelled')} tone="cancel" /> : undefined}
            onPress={() => router.push({ pathname: '/payments/[id]', params: { id: p.id } })}
          />
        )}
      />
      {!liquidity.length && <Text style={{ padding: space.lg }}>{t('Create a bank journal first.')}</Text>}
    </View>
  );
}
