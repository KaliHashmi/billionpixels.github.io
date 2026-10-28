import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { dashboard, JournalCard } from '../../domain/reports';
import { BarChart, Button, ButtonRow, Card, Kpi, Legend, Row, Screen, SectionTitle } from '../../ui/components';
import { colors, space } from '../../ui/theme';

export default function DashboardScreen() {
  const s = useBooks();
  const money = useMoney();
  const d = useMemo(() => dashboard(s), [s]);

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{s.settings.companyName}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Kpi label="Receivables" value={money(d.receivable)} onPress={() => router.push('/reports/aged-receivable')} />
        <Kpi label="Payables" value={money(d.payable)} onPress={() => router.push('/reports/aged-payable')} />
        <Kpi label="Overdue receivables" value={money(d.overdueReceivable)} tone={d.overdueReceivable > 0 ? 'danger' : 'default'} onPress={() => router.push('/followups')} />
        <Kpi label="Bank & Cash" value={money(d.cash)} onPress={() => router.push('/reports/balance-sheet')} />
        <Kpi label="Net profit (this FY)" value={money(d.netProfitYtd)} tone={d.netProfitYtd >= 0 ? 'success' : 'danger'} onPress={() => router.push('/reports/profit-loss')} />
        <Kpi label="Overdue payables" value={money(d.overduePayable)} tone={d.overduePayable > 0 ? 'danger' : 'default'} onPress={() => router.push({ pathname: '/moves', params: { type: 'in_invoice', filter: 'overdue' } })} />
      </View>

      <Card>
        <SectionTitle>Income vs Expenses (6 months)</SectionTitle>
        <View style={{ marginTop: space.md }}>
          <BarChart
            series={d.monthlySales.map((m, i) => ({
              label: m.label,
              values: [
                { value: m.amount, color: colors.accent },
                { value: d.monthlyExpenses[i].amount, color: colors.primary },
              ],
            }))}
          />
          <Legend items={[{ label: 'Income', color: colors.accent }, { label: 'Expenses', color: colors.primary }]} />
        </View>
      </Card>

      <SectionTitle>Journals</SectionTitle>
      {d.cards.map((c) => (
        <JournalCardView key={c.journalId} card={c} money={money} />
      ))}
    </Screen>
  );
}

function JournalCardView({ card, money }: { card: JournalCard; money: (v: number) => string }) {
  const open = () => {
    if (card.type === 'sale') router.push({ pathname: '/moves', params: { type: 'out_invoice' } });
    else if (card.type === 'purchase') router.push({ pathname: '/moves', params: { type: 'in_invoice' } });
    else if (card.type === 'bank' || card.type === 'cash') router.push({ pathname: '/bank', params: { journalId: card.journalId } });
    else router.push({ pathname: '/moves', params: { type: 'entry' } });
  };
  return (
    <Card onPress={open}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{card.name}</Text>
        <Text style={{ fontSize: 12, color: colors.muted, textTransform: 'uppercase' }}>{card.type}</Text>
      </View>
      <Row
        label={card.primary.count ? `${card.primary.label} (${card.primary.count})` : card.primary.label}
        value={card.type === 'general' ? String(card.primary.count) : money(card.primary.amount)}
        bold
      />
      {card.secondary.map((x) => (
        <Row key={x.label} label={`${x.label}${x.count ? ` (${x.count})` : ''}`} value={money(x.amount)} />
      ))}
      <ButtonRow>
        {card.type === 'sale' && <Button small title="New Invoice" icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'out_invoice' } })} />}
        {card.type === 'purchase' && <Button small title="New Bill" icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'in_invoice' } })} />}
        {card.type === 'bank' && <Button small title="Reconcile" icon="git-compare-outline" onPress={open} />}
        {(card.type === 'bank' || card.type === 'cash') && (
          <Button small variant="secondary" title="Add Transaction" icon="add" onPress={() => router.push({ pathname: '/bank/line', params: { journalId: card.journalId } })} />
        )}
        {card.type === 'general' && <Button small title="New Entry" icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'entry' } })} />}
      </ButtonRow>
    </Card>
  );
}
