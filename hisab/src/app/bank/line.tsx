import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useBooks, useStore } from '../../data/store';
import { saveStatementLine } from '../../domain/engine';
import { StatementLine } from '../../domain/types';
import { newId, today } from '../../domain/utils';
import { partnerOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { Button, Card, Screen } from '../../ui/components';
import { DateField, NumberField, SelectField, Segmented, TextField } from '../../ui/fields';

export default function StatementLineForm() {
  const params = useLocalSearchParams<{ journalId?: string; id?: string }>();
  const s = useBooks();
  const { run } = useStore();
  const { t } = useT();
  const existing = params.id ? s.statementLines.find((l) => l.id === params.id) : undefined;
  const [line, setLine] = useState<StatementLine>(
    existing ?? { id: newId(), journalId: params.journalId ?? '', date: today(), label: '', amount: 0, ref: '', reconciled: false },
  );
  const [direction, setDirection] = useState<'in' | 'out'>(existing && existing.amount < 0 ? 'out' : 'in');
  const [amount, setAmount] = useState(Math.abs(existing?.amount ?? 0));

  const save = () => {
    const ok = run((st) => saveStatementLine(st, { ...line, amount: direction === 'in' ? amount : -amount }));
    if (ok) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t(existing ? 'Edit Bank Transaction' : 'New Bank Transaction'), presentation: 'modal' }} />
      <Card>
        <Segmented value={direction} onChange={setDirection} options={[{ value: 'in', label: t('Money In') }, { value: 'out', label: t('Money Out') }]} />
        <DateField label={t('Date')} value={line.date} onChange={(v) => setLine({ ...line, date: v })} />
        <TextField label={t('Label')} value={line.label} onChange={(v) => setLine({ ...line, label: v })} required />
        <NumberField label={t('Amount')} value={amount} onChange={setAmount} required />
        <SelectField label={t('Partner')} value={line.partnerId} options={partnerOptions(s)} onChange={(v) => setLine({ ...line, partnerId: v })} />
        <TextField label={t('Reference')} value={line.ref} onChange={(v) => setLine({ ...line, ref: v })} />
        <Button title={t('Save')} icon="checkmark" onPress={save} />
      </Card>
    </Screen>
  );
}
