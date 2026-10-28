import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useMoney, useStore } from '../../data/store';
import { newPayrollRun, payrollTotals, savePayrollRun } from '../../domain/operations';
import { today } from '../../domain/utils';
import { useT } from '../../i18n';
import { Badge, Button, ButtonRow, Card, EmptyState, ListItem } from '../../ui/components';
import { TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function PayrollList() {
  const s = useBooks();
  const { runWith } = useStore();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const [month, setMonth] = useState(today().slice(0, 7));
  const runs = [...s.payrollRuns].sort((a, b) => b.month.localeCompare(a.month));
  const create = () => {
    const id = runWith((x) => {
      const run = newPayrollRun(x, month);
      return { state: savePayrollRun(x, run), value: run.id };
    });
    if (id) router.push({ pathname: '/payroll/[id]', params: { id } });
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Payroll') }} />
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ padding: space.md }}>
            <Card>
              <TextField label={t('Month (YYYY-MM)')} value={month} onChange={setMonth} />
              <ButtonRow>
                <Button small title={t('New Payroll')} icon="add" onPress={create} />
                <Button small variant="secondary" title={t('Employees')} icon="id-card-outline" onPress={() => router.push('/config/employees')} />
              </ButtonRow>
            </Card>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="people-circle-outline" title={t('No payroll yet')} message={t('Add employees, then create the payroll for a month.')} />}
        renderItem={({ item: r }) => {
          const tot = payrollTotals(r);
          return (
            <ListItem
              title={fmtDate(r.month)}
              subtitle={`${r.payslips.length} ${t('employees')} · ${t('Net')} ${money(tot.net)}`}
              right={money(tot.cost)}
              badge={<Badge label={t(r.state === 'draft' ? 'Draft' : r.state === 'posted' ? 'Posted' : 'Paid')} tone={r.state === 'paid' ? 'paid' : r.state} />}
              onPress={() => router.push({ pathname: '/payroll/[id]', params: { id: r.id } })}
            />
          );
        }}
      />
    </View>
  );
}
