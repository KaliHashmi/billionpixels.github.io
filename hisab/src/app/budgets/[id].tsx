import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useBooks, useStore } from '../../data/store';
import { Budget } from '../../domain/types';
import { newId } from '../../domain/utils';
import { accountOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { Button, ButtonRow, Card, Screen, SectionTitle } from '../../ui/components';
import { confirm, notify } from '../../ui/dialog';
import { NumberField, SelectField, SwitchField, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function BudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const { t } = useT();
  const stored = s.budgets.find((b) => b.id === id);
  const [b, setB] = useState<Budget>(stored ?? { id: newId(), name: '', lines: [], active: true });
  const options = accountOptions(s, (a) => a.type.startsWith('income') || a.type.startsWith('expense'), t);

  const save = () => {
    if (!b.name.trim()) return notify(t('Missing field'), t('Name is required.'));
    const lines = b.lines.filter((l) => l.accountId);
    if (run((x) => ({ ...x, budgets: x.budgets.some((y) => y.id === b.id) ? x.budgets.map((y) => (y.id === b.id ? { ...b, lines } : y)) : [...x.budgets, { ...b, lines }] }))) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: stored ? b.name : t('New Budget') }} />
      <Card>
        <TextField label={t('Budget Name')} value={b.name} onChange={(v) => setB({ ...b, name: v })} required />
        <SwitchField label={t('Active')} value={b.active} onChange={(v) => setB({ ...b, active: v })} />
      </Card>
      <SectionTitle right={<Button small variant="ghost" title={t('Add a line')} icon="add" onPress={() => setB({ ...b, lines: [...b.lines, { accountId: '', monthly: 0 }] })} />}>{t('Monthly amounts')}</SectionTitle>
      {b.lines.map((l, i) => (
        <Card key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <SelectField label={t('Account')} value={l.accountId || undefined} options={options} onChange={(v) => setB({ ...b, lines: b.lines.map((x, j) => (j === i ? { ...x, accountId: v ?? '' } : x)) })} />
              <NumberField label={t('Amount per month')} value={l.monthly} onChange={(v) => setB({ ...b, lines: b.lines.map((x, j) => (j === i ? { ...x, monthly: v } : x)) })} />
            </View>
            <Pressable hitSlop={8} onPress={() => setB({ ...b, lines: b.lines.filter((_, j) => j !== i) })}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        </Card>
      ))}
      <ButtonRow>
        <Button title={t('Save')} icon="checkmark" onPress={save} style={{ flex: 1 }} />
        {stored && (
          <Button
            title={t('Delete')}
            variant="secondary"
            icon="trash-outline"
            onPress={async () => {
              if ((await confirm(t('Delete'), t('Delete this budget?'), t('Delete'), true)) && run((x) => ({ ...x, budgets: x.budgets.filter((y) => y.id !== b.id) }))) router.back();
            }}
          />
        )}
        {stored && <Button title={t('Budget vs. Actual')} variant="secondary" icon="stats-chart-outline" onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'budget', budgetId: b.id } })} />}
      </ButtonRow>
    </Screen>
  );
}
