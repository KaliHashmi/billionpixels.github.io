import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useLookups, useMoney, useStore } from '../../data/store';
import { invoiceStatus, PAYMENT_METHOD_LABELS, registerPayment } from '../../domain/engine';
import { PaymentMethod } from '../../domain/types';
import { today } from '../../domain/utils';
import { accountOptions, journalOptions, partnerOptions, taxOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { Button, Card, Row, Screen } from '../../ui/components';
import { DateField, NumberField, Segmented, SelectField, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

type PartnerType = 'customer' | 'supplier' | 'other';

export default function RegisterPayment() {
  const params = useLocalSearchParams<{ moveId?: string; partnerType?: PartnerType; direction?: 'inbound' | 'outbound'; journalId?: string }>();
  const s = useBooks();
  const lk = useLookups();
  const { runWith } = useStore();
  const money = useMoney();
  const { t } = useT();
  const move = params.moveId ? s.moves.find((m) => m.id === params.moveId) : undefined;
  const st = move ? invoiceStatus(s, move) : undefined;
  const initialType: PartnerType = move ? (move.moveType.startsWith('out') ? 'customer' : 'supplier') : params.partnerType ?? 'customer';
  const defaultDirection = move
    ? move.moveType === 'out_invoice' || move.moveType === 'in_refund'
      ? 'inbound'
      : 'outbound'
    : params.direction ?? (initialType === 'supplier' ? 'outbound' : 'inbound');
  const journals = journalOptions(s, ['bank', 'cash'], t);
  const [partnerType, setPartnerType] = useState<PartnerType>(initialType);
  const [paymentType, setPaymentType] = useState<'inbound' | 'outbound'>(defaultDirection);
  const [partnerId, setPartnerId] = useState<string | undefined>(move?.partnerId);
  const [journalId, setJournalId] = useState<string | undefined>(params.journalId ?? (initialType === 'other' ? s.journals.find((j) => j.type === 'cash')?.id : undefined) ?? journals[0]?.value);
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [amount, setAmount] = useState(st?.residual ?? 0);
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState(move ? move.name : '');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeDate, setChequeDate] = useState(today());
  const [accountId, setAccountId] = useState<string | undefined>();
  const [taxId, setTaxId] = useState<string | undefined>();
  const isCash = journalId ? lk.journals.get(journalId)?.type === 'cash' : false;
  const inbound = paymentType === 'inbound';

  const submit = () => {
    if (!journalId) return;
    const id = runWith((x) => {
      const r = registerPayment(x, {
        paymentType,
        partnerType,
        partnerId,
        amount,
        date,
        journalId,
        memo,
        method: isCash ? 'cash' : method,
        chequeNumber,
        chequeBank,
        chequeDate,
        counterpartAccountId: accountId,
        taxId,
        moveIds: move ? [move.id] : undefined,
      });
      return { state: r.state, value: r.payment.id };
    });
    if (id) router.replace({ pathname: '/payments/[id]', params: { id } });
  };

  const methods: PaymentMethod[] = inbound ? ['bank_transfer', 'cheque', 'card'] : ['bank_transfer', 'cheque'];
  const title = t(inbound ? 'Receipt Voucher' : 'Payment Voucher');

  return (
    <Screen>
      <Stack.Screen options={{ title, presentation: 'modal' }} />
      {move && st && (
        <Card>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{move.name}</Text>
          <Row label={t('Total')} value={money(st.total)} />
          <Row label={t('Amount Due')} value={money(st.residual)} bold />
        </Card>
      )}
      <Card>
        {!move && (
          <>
            <Segmented
              label={t('Type')}
              value={paymentType}
              onChange={setPaymentType}
              options={[
                { value: 'inbound', label: t('Receive Money') },
                { value: 'outbound', label: t('Pay Money') },
              ]}
            />
            <Segmented
              label={t(inbound ? 'Received from' : 'Paid to')}
              value={partnerType}
              onChange={(v) => {
                setPartnerType(v);
                setPartnerId(undefined);
              }}
              options={[
                { value: 'customer', label: t('Customer') },
                { value: 'supplier', label: t('Vendor') },
                { value: 'other', label: t(inbound ? 'Other Income' : 'Expense') },
              ]}
            />
          </>
        )}
        {partnerType !== 'other' ? (
          <SelectField label={t(partnerType === 'customer' ? 'Customer' : 'Vendor')} value={partnerId} editable={!move} options={partnerOptions(s, partnerType)} onChange={setPartnerId} />
        ) : (
          <>
            <SelectField
              label={t(inbound ? 'Income Account' : 'Expense Account')}
              required
              value={accountId}
              options={accountOptions(s, (a) => a.type !== 'asset_cash' && a.type !== 'asset_receivable' && a.type !== 'liability_payable', t)}
              onChange={setAccountId}
            />
            <SelectField label={t('VAT (amount is VAT-inclusive)')} value={taxId} options={taxOptions(s, inbound ? 'sale' : 'purchase', t)} onChange={setTaxId} />
            <SelectField label={t('Partner (optional)')} value={partnerId} options={partnerOptions(s)} onChange={setPartnerId} />
          </>
        )}
        <SelectField label={t('Bank / Cash')} value={journalId} required options={journals} onChange={setJournalId} />
        {!isCash && (
          <Segmented label={t('Payment Method')} value={methods.includes(method) ? method : 'bank_transfer'} onChange={setMethod} options={methods.map((m) => ({ value: m, label: t(PAYMENT_METHOD_LABELS[m]) }))} />
        )}
        {!isCash && method === 'cheque' && (
          <>
            <TextField label={t('Cheque Number')} value={chequeNumber} onChange={setChequeNumber} required keyboardType="number-pad" />
            <TextField label={t('Bank Name')} value={chequeBank} onChange={setChequeBank} />
            <DateField label={t('Cheque Date')} value={chequeDate} onChange={setChequeDate} />
          </>
        )}
        <NumberField label={t('Amount')} value={amount} onChange={setAmount} required />
        <DateField label={t('Date')} value={date} onChange={setDate} />
        <TextField label={t('Description')} value={memo} onChange={setMemo} />
        {move && st && amount < st.residual && amount > 0 && (
          <Text style={{ color: colors.muted, marginBottom: space.md }}>{t('Partial payment: {amount} will remain due.', { amount: money(st.residual - amount) })}</Text>
        )}
        {!isCash && method === 'cheque' && (
          <Text style={{ color: colors.muted, marginBottom: space.md }}>{t('The cheque stays pending until it clears (bank reconciliation or "Mark as cleared").')}</Text>
        )}
        <Button title={t('Confirm')} icon="checkmark" onPress={submit} />
      </Card>
    </Screen>
  );
}
