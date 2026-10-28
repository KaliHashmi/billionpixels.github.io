import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useMoney, useStore } from '../data/store';
import { PAYMENT_METHOD_LABELS } from '../domain/engine';
import { closeCashDay, daySummary, reopenCashDay } from '../domain/operations';
import { round, today } from '../domain/utils';
import { journalOptions } from '../features/entities';
import { useT } from '../i18n';
import { Button, Card, Divider, Row, Screen, SectionTitle } from '../ui/components';
import { confirm } from '../ui/dialog';
import { DateField, NumberField, SelectField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

export default function CashClosingScreen() {
  const s = useBooks();
  const { run } = useStore();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const cashJournals = journalOptions(s, ['cash'], t);
  const [journalId, setJournalId] = useState(cashJournals[0]?.value);
  const [date, setDate] = useState(today());
  const [counted, setCounted] = useState<number | undefined>();
  const [cardSettled, setCardSettled] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const summary = useMemo(() => (journalId ? daySummary(s, journalId, date) : undefined), [s, journalId, date]);
  const closed = s.cashClosings.find((c) => c.journalId === journalId && c.date === date);
  const history = [...s.cashClosings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  if (!journalId || !summary) return <Text style={{ padding: space.lg }}>{t('Create a cash journal first.')}</Text>;
  const d = s.settings.decimals;
  // Default the counts to what the books expect, so only differences need typing.
  const countedCash = counted ?? summary.expectedCash;
  const cardTotal = cardSettled ?? summary.cardReceipts;
  const diff = round(countedCash - summary.expectedCash, d);
  const cardDiff = round(cardTotal - summary.cardReceipts, d);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Daily Cash Closing') }} />
      <Card>
        {cashJournals.length > 1 && <SelectField label={t('Cash Journal')} value={journalId} allowClear={false} options={cashJournals} onChange={(v) => v && setJournalId(v)} />}
        <DateField label={t('Date')} value={date} onChange={setDate} />
        <SectionTitle>{t("Today's collections")}</SectionTitle>
        {(['cash', 'card', 'cheque', 'bank_transfer'] as const).map((m) => (
          <Row key={m} label={t(PAYMENT_METHOD_LABELS[m])} value={money(summary.receipts[m])} />
        ))}
        <Row label={t('Cash paid out')} value={money(summary.paymentsOut)} />
        <Divider />
        <Row label={t('Opening cash')} value={money(summary.openingCash)} />
        <Row label={t('Expected cash in drawer')} value={money(summary.expectedCash)} bold />
      </Card>

      {closed ? (
        <Card>
          <Text style={{ fontWeight: '700', color: colors.success }}>{t('This day is closed.')}</Text>
          <Row label={t('Counted cash')} value={money(closed.counted)} />
          <Row label={t('Difference')} value={money(closed.difference)} valueStyle={{ color: closed.difference ? colors.danger : colors.success }} />
          <Row label={t('Card terminal settlement')} value={money(closed.cardSettled)} />
          {!!closed.notes && <Text style={{ color: colors.muted }}>{closed.notes}</Text>}
          <Button
            small
            variant="secondary"
            title={t('Reopen Day')}
            icon="lock-open-outline"
            onPress={async () => {
              if (await confirm(t('Reopen Day'), t('The closing and any cash difference entry will be removed.'), t('Reopen Day'))) run((x) => reopenCashDay(x, closed.id));
            }}
          />
        </Card>
      ) : (
        <Card>
          <SectionTitle>{t('Count and close')}</SectionTitle>
          <NumberField label={t('Counted cash')} value={countedCash} onChange={setCounted} />
          <Row label={t('Cash difference')} value={money(diff)} bold valueStyle={{ color: diff === 0 ? colors.success : colors.danger }} />
          <NumberField label={t('Card terminal settlement total')} value={cardTotal} onChange={setCardSettled} />
          <Row label={t('Card difference')} value={money(cardDiff)} valueStyle={{ color: cardDiff === 0 ? colors.success : colors.warning }} />
          <TextField label={t('Notes')} value={notes} onChange={setNotes} multiline />
          <Text style={{ color: colors.muted, marginBottom: space.md }}>{t('A cash shortage or overage is posted to the Cash Over/Short account. Card settlements are matched in Bank Reconciliation when the bank credits them.')}</Text>
          <Button title={t('Close Day')} icon="lock-closed-outline" onPress={() => run((x) => closeCashDay(x, { date, journalId, counted: countedCash, cardSettled: cardTotal, notes }))} />
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <SectionTitle>{t('Recent closings')}</SectionTitle>
          {history.map((c) => (
            <Row key={c.id} label={fmtDate(c.date)} value={`${money(c.counted, false)}${c.difference ? ` (${money(c.difference, false)})` : ''}`} valueStyle={c.difference ? { color: colors.danger } : undefined} onPress={() => setDate(c.date)} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
