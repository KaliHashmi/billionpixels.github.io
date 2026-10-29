import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useMoney, usePermissions, useStore } from '../data/store';
import { deleteMove } from '../domain/engine';
import { Move } from '../domain/types';
import { vatReturn, VatReturnLine } from '../domain/management';
import { postTaxClosing } from '../domain/reports';
import { useT } from '../i18n';
import { reportHtml } from '../services/documents';
import { sharePdf } from '../services/files';
import { Button, ButtonRow, Card, Divider, Row, Screen, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { PeriodPicker, usePeriod } from '../ui/PeriodPicker';
import { colors } from '../ui/theme';

export default function TaxReturnScreen() {
  const s = useBooks();
  const { run } = useStore();
  const can = usePermissions();
  const money = useMoney();
  const { t, fmtDate, lang } = useT();
  const [period, setPeriod] = usePeriod(s.settings.fiscalYearLastMonth, 'this_quarter');
  const r = useMemo(() => vatReturn(s, period.from, period.to), [s, period]);
  const closings = s.moves.filter((m) => m.origin === 'tax_closing' && m.state === 'posted').sort((a, b) => b.date.localeCompare(a.date));

  // A closing's period is stored as "from_to" in originId.
  const periodOf = (m: Move) => {
    const [from, to] = (m.originId ?? '').split('_');
    return { from, to };
  };
  const removeClosing = async (m: Move) => {
    const p = periodOf(m);
    const ok = await confirm(
      t('Delete'),
      t('Delete the VAT closing {name} for {from} – {to}? The period is reopened for VAT changes. This cannot be undone.', { name: m.name, from: fmtDate(p.from), to: fmtDate(p.to) }),
      t('Delete'),
      true,
    );
    if (ok) run((st) => deleteMove(st, m.id), { requires: 'deleteDocuments' });
  };
  const recalculate = async (m: Move) => {
    const p = periodOf(m);
    const ok = await confirm(
      t('Edit'),
      t('Replace the VAT closing {name} with one recalculated from the current invoices and bills of {from} – {to}?', { name: m.name, from: fmtDate(p.from), to: fmtDate(p.to) }),
      t('Recalculate'),
    );
    if (ok && run((st) => postTaxClosing(deleteMove(st, m.id), p.from, p.to), { requires: 'editDocuments' })) notify(t('Saved'), t('The VAT closing was recalculated.'));
  };

  const close = async () => {
    const ok = await confirm(
      t('Close tax period'),
      t('This posts an entry moving {amount} to the VAT payable account and locks VAT until {date}.', { amount: money(Math.abs(r.net)), date: fmtDate(period.to) }),
      t('Post Closing Entry'),
    );
    if (ok && run((st) => postTaxClosing(st, period.from, period.to))) notify(t('VAT return closed'), t('Pay or claim the VAT balance with a payment when due.'));
  };

  const line = (l: VatReturnLine) => <Row key={l.key} label={`${t(l.label)}\n${t('Taxable amount')} ${money(l.base, false)}`} value={money(l.vat)} />;

  const pdf = () =>
    sharePdf(
      reportHtml(
        s,
        {
          title: t('VAT Return'),
          subtitle: `${fmtDate(period.from)} – ${fmtDate(period.to)} · ${t('VATIN')} ${s.settings.companyTaxId || '—'}`,
          columns: ['', t('Taxable amount'), t('VAT')],
          rows: [
            { cells: [t('VAT on sales and other outputs'), '', r.outputVat], bold: true },
            ...r.supplies.map((l) => ({ cells: [t(l.label), l.base, l.vat] as (string | number)[], level: 1 })),
            { cells: [t('Recoverable input VAT'), '', r.inputVat], bold: true },
            ...r.purchases.map((l) => ({ cells: [t(l.label), l.base, l.vat] as (string | number)[], level: 1 })),
            { cells: [t(r.net >= 0 ? 'Net VAT payable' : 'Net VAT refundable'), '', Math.abs(r.net)], bold: true },
          ],
        },
        lang,
      ),
      `VAT-Return-${period.from}-${period.to}`,
    ).catch((e) => notify(t('Could not share'), String(e)));

  return (
    <Screen>
      <Stack.Screen options={{ title: t('VAT Return') }} />
      <PeriodPicker value={period} onChange={setPeriod} fyLastMonth={s.settings.fiscalYearLastMonth} />
      <Card>
        <SectionTitle>{t('VAT on sales and other outputs')}</SectionTitle>
        {r.supplies.length === 0 && <Text style={{ color: colors.muted }}>{t('No sales in this period.')}</Text>}
        {r.supplies.map(line)}
        <Row label={t('Total output VAT')} value={money(r.outputVat)} bold />
        <Divider />
        <SectionTitle>{t('Recoverable input VAT')}</SectionTitle>
        {r.purchases.length === 0 && <Text style={{ color: colors.muted }}>{t('No purchases in this period.')}</Text>}
        {r.purchases.map(line)}
        <Row label={t('Total input VAT')} value={money(r.inputVat)} bold />
        <Divider />
        <Row label={t(r.net >= 0 ? 'Net VAT payable' : 'Net VAT refundable')} value={money(Math.abs(r.net))} bold valueStyle={{ color: r.net >= 0 ? colors.danger : colors.success }} />
        <ButtonRow>
          {can.create && <Button small title={t('Close Period')} icon="lock-closed-outline" onPress={close} />}
          <Button small variant="secondary" title={t('Download PDF')} icon="download-outline" onPress={pdf} />
        </ButtonRow>
        {s.settings.taxLockDate && <Text style={{ color: colors.muted, marginTop: 8 }}>{t('VAT locked until {date}.', { date: fmtDate(s.settings.taxLockDate) })}</Text>}
        <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
          {t('Amounts are grouped by VAT treatment. Enter them in the matching boxes of the VAT return on the Oman Tax Authority portal.')}
        </Text>
      </Card>
      {closings.length > 0 && (
        <Card>
          <SectionTitle>{t('Previous closings')}</SectionTitle>
          {closings.map((m) => (
            <View key={m.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 6 }}>
              <Row label={`${m.name} · ${fmtDate(periodOf(m).from)} – ${fmtDate(periodOf(m).to)}`} value={t('Open')} onPress={() => router.push({ pathname: '/moves/[id]', params: { id: m.id } })} />
              {(can.editDocuments || can.deleteDocuments) && (
                <ButtonRow>
                  {can.editDocuments && <Button small variant="secondary" title={t('Recalculate')} icon="refresh-outline" onPress={() => recalculate(m)} />}
                  {can.deleteDocuments && <Button small variant="danger" title={t('Delete')} icon="trash-outline" onPress={() => removeClosing(m)} />}
                </ButtonRow>
              )}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
