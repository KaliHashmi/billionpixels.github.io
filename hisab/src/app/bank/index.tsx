import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useBooks, useLookups, useMoney, useStore } from '../../data/store';
import { saveStatementLine } from '../../domain/engine';
import { AppState } from '../../domain/types';
import { isValidISODate, newId, round } from '../../domain/utils';
import { useT } from '../../i18n';
import { pickTextFile, parseCsv } from '../../services/files';
import { Badge, Button, ButtonRow, Card, Chips, EmptyState, Fab, ListItem, Row, SearchBar } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { SelectField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function BankScreen() {
  const params = useLocalSearchParams<{ journalId?: string }>();
  const s = useBooks();
  const { run } = useStore();
  const lk = useLookups();
  const money = useMoney();
  const { t, fmtDate: formatDate } = useT();
  const liquidity = s.journals.filter((j) => j.active && (j.type === 'bank' || j.type === 'cash'));
  const [journalId, setJournalId] = useState(params.journalId ?? liquidity[0]?.id);
  const [filter, setFilter] = useState<'todo' | 'done' | 'all'>('todo');
  const [q, setQ] = useState('');
  const journal = journalId ? lk.journals.get(journalId) : undefined;

  const lines = useMemo(() => s.statementLines.filter((l) => l.journalId === journalId).sort((a, b) => b.date.localeCompare(a.date)), [s.statementLines, journalId]);
  const statementBalance = round(lines.reduce((x, l) => x + l.amount, 0), s.settings.decimals);
  const glBalance = useMemo(() => {
    const acc = journal?.defaultAccountId;
    let b = 0;
    for (const m of s.moves) if (m.state === 'posted') for (const l of m.lines) if (l.accountId === acc) b += l.debit - l.credit;
    return round(b, s.settings.decimals);
  }, [s.moves, journal, s.settings.decimals]);

  const term = q.trim().toLowerCase();
  const visible = lines.filter((l) => (filter === 'all' || (filter === 'todo' ? !l.reconciled : l.reconciled)) && (!term || l.label.toLowerCase().includes(term) || String(l.amount).includes(term)));

  const importCsv = async () => {
    try {
      const text = await pickTextFile(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
      if (!text || !journalId) return;
      const rows = parseCsv(text);
      const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
      const col = (names: string[]) => header.findIndex((h) => names.includes(h));
      const iDate = col(['date', 'transaction date', 'value date']);
      const iLabel = col(['label', 'description', 'narration', 'details', 'memo']);
      const iAmount = col(['amount', 'value']);
      const iDebit = col(['debit', 'withdrawal', 'money out']);
      const iCredit = col(['credit', 'deposit', 'money in']);
      if (iDate < 0 || iLabel < 0 || (iAmount < 0 && (iDebit < 0 || iCredit < 0))) {
        notify(t('Unrecognized file'), t('The CSV needs a header row with: date, label/description and amount (or debit + credit). Dates must be YYYY-MM-DD.'));
        return;
      }
      const num = (v?: string) => Number((v ?? '').replace(/[^0-9.-]/g, '')) || 0;
      let count = 0;
      let skipped = 0;
      run((st) => {
        let next: AppState = st;
        for (const r of rows.slice(1)) {
          const date = (r[iDate] ?? '').trim();
          const amount = iAmount >= 0 ? num(r[iAmount]) : num(r[iCredit]) - num(r[iDebit]);
          if (!isValidISODate(date) || !amount) {
            skipped++;
            continue;
          }
          next = saveStatementLine(next, { id: newId(), journalId, date, label: (r[iLabel] ?? '').trim(), amount, ref: '', reconciled: false });
          count++;
        }
        return next;
      });
      notify(t('Import finished'), t('{count} transaction(s) imported, {skipped} row(s) skipped.', { count, skipped }));
    } catch (e) {
      notify(t('Import failed'), e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: `${t('Bank Reconciliation')} · ${t(journal?.name ?? '')}` }} />
      <FlatList
        data={visible}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ padding: space.md, gap: space.sm }}>
            {liquidity.length > 1 && (
              <SelectField label={t('Journal')} value={journalId} allowClear={false} options={liquidity.map((j) => ({ value: j.id, label: t(j.name) }))} onChange={(v) => v && setJournalId(v)} />
            )}
            <Card>
              <Row label={t('Balance in General Ledger')} value={money(glBalance)} bold />
              <Row label={t('Balance of transactions')} value={money(statementBalance)} />
              <Row label={t('To reconcile')} value={String(lines.filter((l) => !l.reconciled).length)} />
              <ButtonRow>
                <Button small variant="secondary" title={t('Import CSV')} icon="cloud-upload-outline" onPress={importCsv} />
                <Button small variant="secondary" title={t('Reconciliation Report')} icon="document-text-outline" onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'bank-reconciliation', journalId } })} />
              </ButtonRow>
            </Card>
            <SearchBar value={q} onChangeText={setQ} />
            <Chips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'todo', label: t('To Reconcile') },
                { value: 'done', label: t('Reconciled') },
                { value: 'all', label: t('All') },
              ]}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="swap-vertical-outline" title={t(filter === 'todo' ? 'All caught up!' : 'No transactions')} message={t('Add bank transactions manually or import a CSV statement.')} />
        }
        renderItem={({ item: l }) => (
          <ListItem
            title={l.label || '—'}
            subtitle={[formatDate(l.date), l.partnerId ? lk.partners.get(l.partnerId)?.name : ''].filter(Boolean).join(' · ')}
            right={money(l.amount)}
            badge={l.reconciled ? <Badge label={t('Reconciled')} tone="reconciled" /> : <Badge label={t('To reconcile')} tone="to_reconcile" />}
            onPress={() => router.push({ pathname: '/bank/reconcile', params: { id: l.id } })}
          />
        )}
      />
      {!journal && <Text style={{ padding: space.lg }}>{t('Create a bank journal first.')}</Text>}
      {journal && <Fab onPress={() => router.push({ pathname: '/bank/line', params: { journalId } })} />}
    </View>
  );
}
