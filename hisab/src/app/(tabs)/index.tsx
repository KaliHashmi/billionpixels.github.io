import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { dashboard, JournalCard } from '../../domain/reports';
import { useT } from '../../i18n';
import { monthName } from '../../i18n/translate';
import { BarChart, Button, ButtonRow, Card, Kpi, Legend, Row, Screen, SectionTitle } from '../../ui/components';
import { colors, space } from '../../ui/theme';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardScreen() {
  const s = useBooks();
  const money = useMoney();
  const { t, lang } = useT();
  const d = useMemo(() => dashboard(s), [s]);
  const month = (label: string) => monthName(lang, MONTHS_EN.indexOf(label));

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{lang === 'ar' && s.settings.companyNameAr ? s.settings.companyNameAr : s.settings.companyName}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Kpi label={t('Receivables')} value={money(d.receivable)} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'customer-outstanding' } })} />
        <Kpi label={t('Payables')} value={money(d.payable)} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'supplier-outstanding' } })} />
        <Kpi label={t('Overdue receivables')} value={money(d.overdueReceivable)} tone={d.overdueReceivable > 0 ? 'danger' : 'default'} onPress={() => router.push('/followups')} />
        <Kpi label={t('Bank & Cash')} value={money(d.cash)} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'cash-position' } })} />
        <Kpi label={t('Net profit (this FY)')} value={money(d.netProfitYtd)} tone={d.netProfitYtd >= 0 ? 'success' : 'danger'} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'profit-loss' } })} />
        <Kpi label={t('Overdue payables')} value={money(d.overduePayable)} tone={d.overduePayable > 0 ? 'danger' : 'default'} onPress={() => router.push({ pathname: '/reports/[report]', params: { report: 'pending' } })} />
      </View>

      <ButtonRow>
        <Button small title={t('Receive Money')} icon="arrow-down-circle-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'customer' } })} />
        <Button small title={t('Pay Money')} icon="arrow-up-circle-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'supplier' } })} />
        <Button small variant="secondary" title={t('Cash Expense')} icon="wallet-outline" onPress={() => router.push({ pathname: '/payments/new', params: { partnerType: 'other', direction: 'outbound' } })} />
        <Button small variant="secondary" title={t('Daily Cash Closing')} icon="lock-closed-outline" onPress={() => router.push('/cash-closing')} />
      </ButtonRow>

      <Card>
        <SectionTitle>{t('Income vs Expenses (6 months)')}</SectionTitle>
        <View style={{ marginTop: space.md }}>
          <BarChart
            series={d.monthlySales.map((m, i) => ({
              label: month(m.label),
              values: [
                { value: m.amount, color: colors.accent },
                { value: d.monthlyExpenses[i].amount, color: colors.primary },
              ],
            }))}
          />
          <Legend items={[{ label: t('Income'), color: colors.accent }, { label: t('Expenses'), color: colors.primary }]} />
        </View>
      </Card>

      <SectionTitle>{t('Journals')}</SectionTitle>
      {d.cards.map((c) => (
        <JournalCardView key={c.journalId} card={c} money={money} />
      ))}
    </Screen>
  );
}

function JournalCardView({ card, money }: { card: JournalCard; money: (v: number) => string }) {
  const { t } = useT();
  const open = () => {
    if (card.type === 'sale') router.push({ pathname: '/moves', params: { type: 'out_invoice' } });
    else if (card.type === 'purchase') router.push({ pathname: '/moves', params: { type: 'in_invoice' } });
    else if (card.type === 'bank' || card.type === 'cash') router.push({ pathname: '/cashbook', params: { journalId: card.journalId } });
    else router.push({ pathname: '/moves', params: { type: 'entry' } });
  };
  const typeLabel = { sale: 'Sales', purchase: 'Purchase', bank: 'Bank', cash: 'Cash', general: 'Miscellaneous' }[card.type] ?? card.type;
  return (
    <Card onPress={open}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{t(card.name)}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>{t(typeLabel)}</Text>
      </View>
      <Row
        label={card.primary.count ? `${t(card.primary.label)} (${card.primary.count})` : t(card.primary.label)}
        value={card.type === 'general' ? String(card.primary.count) : money(card.primary.amount)}
        bold
      />
      {card.secondary.map((x) => (
        <Row key={x.label} label={`${t(x.label)}${x.count ? ` (${x.count})` : ''}`} value={money(x.amount)} />
      ))}
      <ButtonRow>
        {card.type === 'sale' && <Button small title={t('New Invoice')} icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'out_invoice' } })} />}
        {card.type === 'purchase' && <Button small title={t('New Bill')} icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'in_invoice' } })} />}
        {card.type === 'bank' && <Button small title={t('Reconcile')} icon="git-compare-outline" onPress={() => router.push({ pathname: '/bank', params: { journalId: card.journalId } })} />}
        {card.type === 'cash' && <Button small title={t('Cash Closing')} icon="lock-closed-outline" onPress={() => router.push('/cash-closing')} />}
        {card.type === 'general' && <Button small title={t('New Entry')} icon="add" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: 'new', type: 'entry' } })} />}
      </ButtonRow>
    </Card>
  );
}
