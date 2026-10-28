import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useMoney, useStore } from '../../data/store';
import { invoiceStatus, registerPayment } from '../../domain/engine';
import { today } from '../../domain/utils';
import { journalOptions, partnerOptions } from '../../features/entities';
import { Button, Card, Row, Screen } from '../../ui/components';
import { DateField, NumberField, SelectField, Segmented, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function RegisterPayment() {
  const params = useLocalSearchParams<{ moveId?: string; partnerType?: 'customer' | 'supplier' }>();
  const s = useBooks();
  const { runWith } = useStore();
  const money = useMoney();
  const move = params.moveId ? s.moves.find((m) => m.id === params.moveId) : undefined;
  const st = move ? invoiceStatus(s, move) : undefined;
  const partnerType = move ? (move.moveType.startsWith('out') ? 'customer' : 'supplier') : params.partnerType ?? 'customer';
  const defaultType = move
    ? move.moveType === 'out_invoice' || move.moveType === 'in_refund'
      ? 'inbound'
      : 'outbound'
    : partnerType === 'customer'
      ? 'inbound'
      : 'outbound';
  const journals = journalOptions(s, ['bank', 'cash']);
  const [paymentType, setPaymentType] = useState<'inbound' | 'outbound'>(defaultType);
  const [partnerId, setPartnerId] = useState<string | undefined>(move?.partnerId);
  const [journalId, setJournalId] = useState<string | undefined>(journals[0]?.value);
  const [amount, setAmount] = useState(st?.residual ?? 0);
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState(move ? move.name : '');

  const submit = () => {
    if (!journalId) return;
    const id = runWith((x) => {
      const r = registerPayment(x, { paymentType, partnerType, partnerId, amount, date, journalId, memo, moveIds: move ? [move.id] : undefined });
      return { state: r.state, value: r.payment.id };
    });
    if (id) {
      if (move) router.back();
      else router.replace({ pathname: '/payments/[id]', params: { id } });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: move ? 'Register Payment' : 'New Payment', presentation: 'modal' }} />
      {move && st && (
        <Card>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{move.name}</Text>
          <Row label="Total" value={money(st.total)} />
          <Row label="Amount Due" value={money(st.residual)} bold />
        </Card>
      )}
      <Card>
        {!move && (
          <Segmented
            label="Payment Type"
            value={paymentType}
            onChange={setPaymentType}
            options={[
              { value: 'inbound', label: 'Receive' },
              { value: 'outbound', label: 'Send' },
            ]}
          />
        )}
        <SelectField label={partnerType === 'customer' ? 'Customer' : 'Vendor'} value={partnerId} editable={!move} options={partnerOptions(s, partnerType)} onChange={setPartnerId} />
        <SelectField label="Journal" value={journalId} required options={journals} onChange={setJournalId} />
        <NumberField label="Amount" value={amount} onChange={setAmount} required />
        <DateField label="Payment Date" value={date} onChange={setDate} />
        <TextField label="Memo" value={memo} onChange={setMemo} />
        {move && st && amount < st.residual && amount > 0 && (
          <Text style={{ color: colors.muted, marginBottom: space.md }}>Partial payment: {money(st.residual - amount)} will remain due.</Text>
        )}
        <Button title="Create Payment" icon="checkmark" onPress={submit} />
      </Card>
    </Screen>
  );
}
