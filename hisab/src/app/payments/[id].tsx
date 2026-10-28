import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useBooks, useLookups, useMoney, useStore } from '../../data/store';
import { cancelPayment } from '../../domain/engine';
import { formatDate } from '../../domain/utils';
import { Badge, Button, ButtonRow, Card, ListItem, Row, Screen, SectionTitle } from '../../ui/components';
import { confirm } from '../../ui/dialog';
import { colors } from '../../ui/theme';

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const lk = useLookups();
  const money = useMoney();
  const p = s.payments.find((x) => x.id === id);
  if (!p) return null;
  const move = s.moves.find((m) => m.id === p.moveId);
  const matched = s.reconciles
    .filter((r) => r.debitMoveId === p.moveId || r.creditMoveId === p.moveId)
    .map((r) => ({ r, other: s.moves.find((m) => m.id === (r.debitMoveId === p.moveId ? r.creditMoveId : r.debitMoveId)) }));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Payment' }} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>{p.name}</Text>
        <Badge label={p.state === 'cancel' ? 'Cancelled' : 'Posted'} tone={p.state === 'cancel' ? 'cancel' : 'posted'} />
        <Row label="Type" value={p.paymentType === 'inbound' ? 'Receive money' : 'Send money'} />
        <Row label={p.partnerType === 'customer' ? 'Customer' : 'Vendor'} value={p.partnerId ? lk.partners.get(p.partnerId)?.name : '—'} />
        <Row label="Amount" value={money(p.amount)} bold />
        <Row label="Date" value={formatDate(p.date)} />
        <Row label="Journal" value={lk.journals.get(p.journalId)?.name} />
        <Row label="Memo" value={p.memo || '—'} />
        {p.state === 'posted' && (
          <ButtonRow>
            {move && <Button small variant="secondary" title="Journal Entry" icon="journal-outline" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: move.id } })} />}
            <Button
              small
              variant="danger"
              title="Cancel Payment"
              onPress={async () => {
                if (await confirm('Cancel payment', 'The payment will be unreconciled from its invoices and its journal entry cancelled.', 'Cancel Payment', true)) run((x) => cancelPayment(x, p.id));
              }}
            />
          </ButtonRow>
        )}
      </Card>
      <SectionTitle>Reconciled with</SectionTitle>
      {matched.length === 0 && <Text style={{ color: colors.muted }}>Not matched with any document yet.</Text>}
      {matched.map(({ r, other }) => (
        <ListItem key={r.id} title={other?.name ?? ''} subtitle={formatDate(r.date)} right={money(r.amount)} onPress={() => other && router.push({ pathname: '/moves/[id]', params: { id: other.id } })} />
      ))}
    </Screen>
  );
}
