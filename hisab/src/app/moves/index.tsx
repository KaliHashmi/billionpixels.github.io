import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../../data/store';
import { invoiceStatus, isInvoice } from '../../domain/engine';
import { MoveType } from '../../domain/types';
import { moveBadge } from '../../features/status';
import { useT } from '../../i18n';
import { Badge, Chips, EmptyState, Fab, ListItem, SearchBar } from '../../ui/components';
import { colors, space } from '../../ui/theme';

const TITLES: Record<MoveType, string> = {
  out_invoice: 'Sales Invoices',
  out_refund: 'Credit Notes',
  in_invoice: 'Purchase Invoices',
  in_refund: 'Vendor Credit Notes',
  entry: 'Journal Entries',
};

type Filter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'posted';

export default function MovesList() {
  const params = useLocalSearchParams<{ type?: MoveType; filter?: Filter; partnerId?: string }>();
  const type: MoveType = params.type ?? 'out_invoice';
  const s = useBooks();
  const { partners, journals, reconcileIndex } = useLookups();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const formatDate = fmtDate;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(params.filter ?? 'all');
  const invoice = isInvoice(type);

  const rows = useMemo(() => {
    return s.moves
      .filter((m) => m.moveType === type && (!params.partnerId || m.partnerId === params.partnerId))
      .map((m) => {
        const st = invoice ? invoiceStatus(s, m, reconcileIndex) : undefined;
        const total = st ? st.total : m.lines.reduce((x, l) => x + l.debit, 0);
        return { m, st, total };
      })
      .sort((a, b) => b.m.date.localeCompare(a.m.date) || b.m.name.localeCompare(a.m.name));
  }, [s, type, invoice, reconcileIndex, params.partnerId]);

  const matches = (f: Filter, r: (typeof rows)[number]) => {
    switch (f) {
      case 'draft':
        return r.m.state === 'draft';
      case 'posted':
        return r.m.state === 'posted';
      case 'open':
        return r.m.state === 'posted' && (r.st?.paymentState === 'not_paid' || r.st?.paymentState === 'partial');
      case 'overdue':
        return r.m.state === 'posted' && !!r.st?.overdue;
      case 'paid':
        return r.m.state === 'posted' && (r.st?.paymentState === 'paid' || r.st?.paymentState === 'in_payment' || r.st?.paymentState === 'reversed');
      default:
        return true;
    }
  };

  const filters: { value: Filter; label: string; count: number }[] = (invoice
    ? (['all', 'draft', 'open', 'overdue', 'paid'] as Filter[])
    : (['all', 'draft', 'posted'] as Filter[])
  ).map((f) => ({
    value: f,
    label: t({ all: 'All', draft: 'Draft', open: type.startsWith('in') ? 'To Pay' : 'Unpaid', overdue: 'Overdue', paid: 'Paid', posted: 'Posted' }[f]),
    count: rows.filter((r) => matches(f, r)).length,
  }));

  const term = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      matches(filter, r) &&
      (!term ||
        r.m.name.toLowerCase().includes(term) ||
        r.m.ref.toLowerCase().includes(term) ||
        (r.m.partnerId && partners.get(r.m.partnerId)?.name.toLowerCase().includes(term))),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t(TITLES[type]) }} />
      <View style={{ padding: space.md, gap: space.sm }}>
        <SearchBar value={q} onChangeText={setQ} placeholder={t('Search number, partner, reference…')} />
        <Chips options={filters} value={filter} onChange={setFilter} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.m.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState title={t('Nothing here yet')} message={t('Tap + to create one.')} />}
        renderItem={({ item: { m, st, total } }) => {
          const badge = moveBadge(m, st);
          const partner = m.partnerId ? partners.get(m.partnerId)?.name : undefined;
          return (
            <ListItem
              title={m.name === '/' ? `${t('Draft')} ${m.ref ? `· ${m.ref}` : ''}` : m.name}
              subtitle={[partner ?? (invoice ? '' : t(journals.get(m.journalId)?.name ?? '')), formatDate(m.invoiceDate ?? m.date), m.dueDate && st && st.residual > 0 && m.state === 'posted' ? `${t('Due')} ${formatDate(m.dueDate)}` : '']
                .filter(Boolean)
                .join(' · ')}
              right={money(total)}
              rightSub={st && m.state === 'posted' && st.residual > 0 && st.residual !== total ? `${t('Due')} ${money(st.residual)}` : undefined}
              badge={<Badge label={t(badge.label)} tone={badge.tone} />}
              onPress={() => router.push({ pathname: '/moves/[id]', params: { id: m.id } })}
            />
          );
        }}
      />
      <Fab onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type, partnerId: params.partnerId } })} />
    </View>
  );
}
