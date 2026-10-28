import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Text } from 'react-native';
import { useBooks, useMoney } from '../../data/store';
import { agedBalance } from '../../domain/reports';
import { formatDate, today } from '../../domain/utils';
import { statementHtml } from '../../services/documents';
import { printHtml, sharePdf } from '../../services/files';
import { Button, ButtonRow, Card, ListItem, Row, Screen, SectionTitle } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { colors } from '../../ui/theme';

export default function FollowUpPartner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const money = useMoney();
  const partner = s.partners.find((p) => p.id === id);
  const items = useMemo(() => {
    const row = agedBalance(s, 'receivable', today()).rows.find((r) => r.partnerId === id);
    return (row?.items ?? []).map((i) => ({ move: i.move, residual: i.residual, days: i.days, due: i.line.dateMaturity }));
  }, [s, id]);
  if (!partner) return null;
  const total = items.reduce((x, i) => x + i.residual, 0);
  const overdue = items.filter((i) => i.days > 0).reduce((x, i) => x + i.residual, 0);
  const html = () => statementHtml(s, partner, items);

  const email = () => {
    if (!partner.email) return notify('No email', 'Add an email address to this customer first.');
    const body = `Dear ${partner.name},\n\nOur records show an outstanding balance of ${money(total)} (overdue: ${money(overdue)}).\n\n${items
      .map((i) => `- ${i.move.name} due ${formatDate(i.due)}: ${money(i.residual)}`)
      .join('\n')}\n\nKind regards,\n${s.settings.companyName}`;
    Linking.openURL(`mailto:${partner.email}?subject=${encodeURIComponent(`Payment reminder - ${s.settings.companyName}`)}&body=${encodeURIComponent(body)}`).catch(() =>
      notify('No email app', 'Could not open an email app on this device.'),
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: partner.name }} />
      <Card>
        <Row label="Total due" value={money(total)} bold />
        <Row label="Overdue" value={money(overdue)} valueStyle={{ color: overdue > 0 ? colors.danger : colors.text }} />
        <Row label="Email" value={partner.email || '—'} />
        <Row label="Phone" value={partner.phone || '—'} />
        <ButtonRow>
          <Button small title="Send Reminder (PDF)" icon="share-outline" onPress={() => sharePdf(html(), `Reminder-${partner.name}`).catch((e) => notify('Error', String(e)))} />
          <Button small variant="secondary" title="Email" icon="mail-outline" onPress={email} />
          <Button small variant="secondary" title="Print" icon="print-outline" onPress={() => printHtml(html()).catch((e) => notify('Error', String(e)))} />
          {!!partner.phone && <Button small variant="secondary" title="Call" icon="call-outline" onPress={() => Linking.openURL(`tel:${partner.phone}`)} />}
        </ButtonRow>
      </Card>
      <SectionTitle>Open items</SectionTitle>
      {items.length === 0 && <Text style={{ color: colors.muted }}>Nothing due.</Text>}
      {items.map((i) => (
        <ListItem
          key={i.move.id + i.due}
          title={i.move.name}
          subtitle={`Due ${formatDate(i.due)}${i.days > 0 ? ` · ${i.days} days late` : ''}`}
          right={money(i.residual)}
          onPress={() => router.push({ pathname: '/moves/[id]', params: { id: i.move.id } })}
        />
      ))}
    </Screen>
  );
}
