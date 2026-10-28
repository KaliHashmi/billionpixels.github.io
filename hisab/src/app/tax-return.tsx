import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { Text } from 'react-native';
import { useBooks, useMoney, useStore } from '../data/store';
import { postTaxClosing, taxReport } from '../domain/reports';
import { formatDate } from '../domain/utils';
import { reportHtml } from '../services/documents';
import { sharePdf } from '../services/files';
import { Button, ButtonRow, Card, Divider, Row, Screen, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { PeriodPicker, usePeriod } from '../ui/PeriodPicker';
import { colors } from '../ui/theme';

export default function TaxReturnScreen() {
  const s = useBooks();
  const { run } = useStore();
  const money = useMoney();
  const [period, setPeriod] = usePeriod(s.settings.fiscalYearLastMonth, 'this_quarter');
  const r = useMemo(() => taxReport(s, period.from, period.to), [s, period]);
  const closings = s.moves.filter((m) => m.origin === 'tax_closing' && m.state === 'posted').sort((a, b) => b.date.localeCompare(a.date));

  const close = async () => {
    const ok = await confirm(
      'Close tax period',
      `This posts an entry moving ${money(Math.abs(r.net))} to the tax settlement account and locks taxes until ${formatDate(period.to)}.`,
      'Post Closing Entry',
    );
    if (ok && run((st) => postTaxClosing(st, period.from, period.to))) notify('Tax return closed', 'Pay or claim the settlement balance with a payment when due.');
  };

  const pdf = () =>
    sharePdf(
      reportHtml(s, {
        title: 'Tax Report',
        subtitle: `${formatDate(period.from)} – ${formatDate(period.to)}`,
        columns: ['Tax', 'Net', 'Tax'],
        rows: [
          { cells: ['Sales', r.sales.reduce((x, y) => x + y.base, 0), r.salesTax], bold: true },
          ...r.sales.map((x) => ({ cells: [x.tax.name, x.base, x.amount] as (string | number)[], level: 1 })),
          { cells: ['Purchases', r.purchases.reduce((x, y) => x + y.base, 0), r.purchaseTax], bold: true },
          ...r.purchases.map((x) => ({ cells: [x.tax.name, x.base, x.amount] as (string | number)[], level: 1 })),
          { cells: ['Net tax due', '', r.net], bold: true },
        ],
      }),
      `Tax-Report-${period.from}-${period.to}`,
    ).catch((e) => notify('Could not share', String(e)));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Tax Return' }} />
      <PeriodPicker value={period} onChange={setPeriod} fyLastMonth={s.settings.fiscalYearLastMonth} />
      <Card>
        <SectionTitle>Sales (output tax)</SectionTitle>
        {r.sales.length === 0 && <Text style={{ color: colors.muted }}>No taxed sales.</Text>}
        {r.sales.map((x) => (
          <Row key={x.tax.id} label={`${x.tax.name} · base ${money(x.base, false)}`} value={money(x.amount)} />
        ))}
        <Row label="Total output tax" value={money(r.salesTax)} bold />
        <Divider />
        <SectionTitle>Purchases (input tax)</SectionTitle>
        {r.purchases.length === 0 && <Text style={{ color: colors.muted }}>No taxed purchases.</Text>}
        {r.purchases.map((x) => (
          <Row key={x.tax.id} label={`${x.tax.name} · base ${money(x.base, false)}`} value={money(x.amount)} />
        ))}
        <Row label="Total input tax" value={money(r.purchaseTax)} bold />
        <Divider />
        <Row label={r.net >= 0 ? 'Net tax payable' : 'Net tax refundable'} value={money(Math.abs(r.net))} bold valueStyle={{ color: r.net >= 0 ? colors.danger : colors.success }} />
        <ButtonRow>
          <Button small title="Close Period" icon="lock-closed-outline" onPress={close} />
          <Button small variant="secondary" title="PDF" icon="share-outline" onPress={pdf} />
        </ButtonRow>
        {s.settings.taxLockDate && <Text style={{ color: colors.muted, marginTop: 8 }}>Taxes locked until {formatDate(s.settings.taxLockDate)}.</Text>}
      </Card>
      {closings.length > 0 && (
        <Card>
          <SectionTitle>Previous closings</SectionTitle>
          {closings.map((m) => (
            <Row key={m.id} label={`${m.name} · ${m.ref}`} value="Open" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: m.id } })} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
