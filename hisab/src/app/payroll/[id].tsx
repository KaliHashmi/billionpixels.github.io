import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useMoney, usePermissions, useStore } from '../../data/store';
import { deletePayrollRun, payPayroll, payrollTotals, postPayroll, recomputePayslip, resetPayroll, savePayrollRun } from '../../domain/operations';
import { today } from '../../domain/utils';
import { journalOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { reportHtml } from '../../services/documents';
import { sharePdf } from '../../services/files';
import { Badge, Button, ButtonRow, Card, Divider, Row, Screen, SectionTitle } from '../../ui/components';
import { confirm, notify } from '../../ui/dialog';
import { DateField, NumberField, SelectField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function PayrollRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const can = usePermissions();
  const money = useMoney();
  const { t, fmtDate, lang } = useT();
  const stored = s.payrollRuns.find((r) => r.id === id);
  const banks = journalOptions(s, ['bank', 'cash'], t);
  const [journalId, setJournalId] = useState(banks[0]?.value);
  const [payDate, setPayDate] = useState(today());
  if (!stored) return null;
  const draft = stored.state === 'draft';
  const tot = payrollTotals(stored);
  // Accountants may prepare a payroll until it is first posted; after that only administrators change it.
  const editable = draft && (stored.issued ? can.editDocuments : can.create);
  const employees = new Map(s.employees.map((e) => [e.id, e]));

  const setSlip = (employeeId: string, patch: { overtime?: number; deductions?: number }) =>
    run(
      (x) => savePayrollRun(x, { ...stored, payslips: stored.payslips.map((p) => (p.employeeId === employeeId ? recomputePayslip(x, { ...p, ...patch }) : p)) }),
      stored.issued ? { requires: 'editDocuments' } : undefined,
    );
  const edit = async () => {
    const ok = await confirm(
      t('Edit'),
      t('The payroll goes back to draft and its journal entries (and salary payment, if any) are removed. Post it again when you are done.'),
      t('Edit'),
    );
    if (ok) run((x) => resetPayroll(x, stored.id), { requires: 'editDocuments' });
  };
  const remove = async () => {
    const message = draft ? t('Delete this payroll?') : t('Delete this payroll and its journal entries (and salary payment, if any)? This cannot be undone.');
    if ((await confirm(t('Delete'), message, t('Delete'), true)) && run((x) => deletePayrollRun(x, stored.id), { requires: 'deleteDocuments' })) router.back();
  };

  const sheet = () =>
    sharePdf(
      reportHtml(
        s,
        {
          title: `${t('Salary Sheet')} ${fmtDate(stored.month)}`,
          subtitle: fmtDate(stored.date),
          columns: [t('Employee'), t('Basic'), t('Allowances'), t('Overtime'), t('Deductions'), t('Social Insurance'), t('Net Salary')],
          rows: [
            ...stored.payslips.map((p) => ({ cells: [employees.get(p.employeeId)?.name ?? '', p.basic, p.allowances, p.overtime, p.deductions, p.siEmployee, p.net] as (string | number)[] })),
            { cells: [t('Total'), tot.basic, tot.allowances, tot.overtime, tot.deductions, tot.siEmployee, tot.net], bold: true },
          ],
        },
        lang,
      ),
      `Payroll-${stored.month}`,
    ).catch((e) => notify(t('Could not share'), String(e)));

  return (
    <Screen>
      <Stack.Screen options={{ title: `${t('Payroll')} ${fmtDate(stored.month)}` }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>{fmtDate(stored.month)}</Text>
          <Badge label={t(stored.state === 'draft' ? 'Draft' : stored.state === 'posted' ? 'Posted' : 'Paid')} tone={stored.state === 'paid' ? 'paid' : stored.state} />
        </View>
        <Row label={t('Gross salaries')} value={money(tot.gross)} />
        <Row label={t('Employee social insurance')} value={money(tot.siEmployee)} />
        <Row label={t('Employer social insurance')} value={money(tot.siEmployer)} />
        <Row label={t('Deductions')} value={money(tot.deductions)} />
        <Divider />
        <Row label={t('Net salaries to pay')} value={money(tot.net)} bold />
        <Row label={t('Total cost to company')} value={money(tot.cost)} />
        <ButtonRow>
          {draft && can.create && <Button small title={t('Post Payroll')} icon="checkmark" onPress={() => run((x) => postPayroll(x, stored.id))} />}
          <Button small variant="secondary" title={t('Salary Sheet PDF')} icon="share-outline" onPress={sheet} />
          {stored.moveId && <Button small variant="secondary" title={t('Journal Entry')} icon="journal-outline" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: stored.moveId! } })} />}
          {!draft && can.editDocuments && <Button small variant="secondary" title={t('Edit')} icon="create-outline" onPress={edit} />}
          {can.deleteDocuments && <Button small variant="danger" title={t('Delete')} icon="trash-outline" onPress={remove} />}
        </ButtonRow>
      </Card>

      {stored.state === 'posted' && can.create && (
        <Card>
          <SectionTitle>{t('Pay Salaries')}</SectionTitle>
          <SelectField label={t('Pay from')} value={journalId} allowClear={false} options={banks} onChange={(v) => v && setJournalId(v)} />
          <DateField label={t('Payment Date')} value={payDate} onChange={setPayDate} />
          <Button title={t('Pay {amount}', { amount: money(tot.net) })} icon="cash-outline" onPress={() => journalId && run((x) => payPayroll(x, stored.id, journalId, payDate))} />
        </Card>
      )}

      <SectionTitle>{t('Payslips')}</SectionTitle>
      {stored.payslips.map((p) => {
        const e = employees.get(p.employeeId);
        return (
          <Card key={p.employeeId}>
            <Text style={{ fontWeight: '700', fontSize: 15 }}>{e?.name ?? '?'}</Text>
            <Text style={{ color: colors.muted, marginBottom: space.sm }}>{[e?.position, e ? t(e.nationality === 'omani' ? 'Omani' : 'Expatriate') : ''].filter(Boolean).join(' · ')}</Text>
            <Row label={t('Basic')} value={money(p.basic, false)} />
            <Row label={t('Allowances')} value={money(p.allowances, false)} />
            {editable ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <NumberField compact label={t('Overtime')} value={p.overtime} onChange={(v) => setSlip(p.employeeId, { overtime: v })} />
                <NumberField compact label={t('Deductions')} value={p.deductions} onChange={(v) => setSlip(p.employeeId, { deductions: v })} />
              </View>
            ) : (
              <>
                <Row label={t('Overtime')} value={money(p.overtime, false)} />
                <Row label={t('Deductions')} value={money(p.deductions, false)} />
              </>
            )}
            <Row label={t('Social insurance (employee)')} value={money(p.siEmployee, false)} />
            <Row label={t('Net Salary')} value={money(p.net)} bold />
            {!!e?.iban && <Text style={{ color: colors.muted, fontSize: 12 }}>{e.bankName} · {e.iban}</Text>}
          </Card>
        );
      })}
    </Screen>
  );
}
