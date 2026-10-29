import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useLookups, useMoney, usePermissions, useStore } from '../../data/store';
import { bounceCheque, chequeStatus, clearCheque, deletePayment, PAYMENT_METHOD_LABELS, unclearCheque } from '../../domain/engine';
import { today } from '../../domain/utils';
import { useT } from '../../i18n';
import { voucherHtml } from '../../services/documents';
import { printHtml, sharePdf } from '../../services/files';
import { Badge, Button, ButtonRow, Card, ListItem, Row, Screen, SectionTitle } from '../../ui/components';
import { confirm, notify } from '../../ui/dialog';
import { DateField } from '../../ui/fields';
import { colors } from '../../ui/theme';

const CHEQUE_LABELS = { pending: 'Pending Clearance', cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled' };

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const can = usePermissions();
  const lk = useLookups();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const [clearDate, setClearDate] = useState(today());
  const p = s.payments.find((x) => x.id === id);
  if (!p) return null;
  const move = s.moves.find((m) => m.id === p.moveId);
  const matched = s.reconciles
    .filter((r) => r.debitMoveId === p.moveId || r.creditMoveId === p.moveId)
    .map((r) => ({ r, other: s.moves.find((m) => m.id === (r.debitMoveId === p.moveId ? r.creditMoveId : r.debitMoveId)) }));
  const inbound = p.paymentType === 'inbound';
  const cheque = p.method === 'cheque' ? chequeStatus(s, p) : undefined;
  const voucher = () => voucherHtml(s, p);
  const remove = async () => {
    const ok = await confirm(
      t('Delete'),
      t('Delete {name} permanently? Its journal entries are removed and the invoices it paid become due again. This cannot be undone.', { name: p.name }),
      t('Delete'),
      true,
    );
    if (ok && run((x) => deletePayment(x, p.id), { requires: 'deleteDocuments' })) router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t(inbound ? 'Receipt Voucher' : 'Payment Voucher') }} />
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800' }}>{p.name}</Text>
        <Badge label={t(p.state === 'cancel' ? (p.bounced ? 'Bounced' : 'Cancelled') : 'Posted')} tone={p.state === 'cancel' ? 'cancel' : 'posted'} />
        <Row label={t('Type')} value={t(inbound ? 'Receive Money' : 'Pay Money')} />
        <Row label={t(inbound ? 'Received from' : 'Paid to')} value={p.partnerId ? lk.partners.get(p.partnerId)?.name : p.counterpartAccountId ? t(lk.accounts.get(p.counterpartAccountId)?.name ?? '') : '—'} />
        <Row label={t('Amount')} value={money(p.amount)} bold />
        <Row label={t('Date')} value={fmtDate(p.date)} />
        <Row label={t('Bank / Cash')} value={t(lk.journals.get(p.journalId)?.name ?? '')} />
        <Row label={t('Payment Method')} value={t(PAYMENT_METHOD_LABELS[p.method])} />
        {p.method === 'cheque' && (
          <>
            <Row label={t('Cheque Number')} value={p.chequeNumber} />
            {!!p.chequeBank && <Row label={t('Bank Name')} value={p.chequeBank} />}
            <Row label={t('Cheque Date')} value={fmtDate(p.chequeDate)} />
            <Row label={t('Cheque Status')} value={t(CHEQUE_LABELS[cheque!])} valueStyle={{ color: cheque === 'cleared' ? colors.success : cheque === 'pending' ? colors.warning : colors.danger, fontWeight: '700' }} />
          </>
        )}
        <Row label={t('Description')} value={p.memo || '—'} />
        <ButtonRow>
          <Button small title={t('Voucher PDF')} icon="share-outline" onPress={() => sharePdf(voucher(), p.name.replace(/\//g, '-')).catch((e) => notify(t('Could not share'), String(e)))} />
          <Button small variant="secondary" title={t('Print')} icon="print-outline" onPress={() => printHtml(voucher(), p.name.replace(/\//g, '-')).catch((e) => notify(t('Could not print'), String(e)))} />
          {move && <Button small variant="secondary" title={t('Journal Entry')} icon="journal-outline" onPress={() => router.push({ pathname: '/moves/[id]', params: { id: move.id } })} />}
          {p.state === 'posted' && can.editDocuments && (
            <Button small variant="secondary" title={t('Edit')} icon="create-outline" onPress={() => router.push({ pathname: '/payments/new', params: { editId: p.id } })} />
          )}
          {can.deleteDocuments && <Button small variant="danger" title={t('Delete')} icon="trash-outline" onPress={remove} />}
        </ButtonRow>
      </Card>

      {cheque === 'pending' && can.create && (
        <Card>
          <SectionTitle>{t('Cheque Clearance')}</SectionTitle>
          <Text style={{ color: colors.muted, marginVertical: 8 }}>{t('Use this only if you do not reconcile bank statements; otherwise match the cheque in Bank Reconciliation.')}</Text>
          <DateField label={t('Clearing Date')} value={clearDate} onChange={setClearDate} />
          <ButtonRow>
            <Button small title={t('Mark as Cleared')} icon="checkmark-done" onPress={() => run((x) => clearCheque(x, p.id, clearDate))} />
            <Button
              small
              variant="danger"
              title={t('Bounced / Returned')}
              icon="close-circle-outline"
              onPress={async () => {
                if (await confirm(t('Bounced cheque'), t('The cheque is cancelled and the related invoices become due again.'), t('Confirm'), true)) run((x) => bounceCheque(x, p.id));
              }}
            />
          </ButtonRow>
        </Card>
      )}
      {cheque === 'cleared' && p.clearingMoveId && can.editDocuments && (
        <Button small variant="secondary" title={t('Undo Clearance')} icon="arrow-undo-outline" onPress={() => run((x) => unclearCheque(x, p.id), { requires: 'editDocuments' })} />
      )}
      {p.partnerType !== 'other' && (
        <>
          <SectionTitle>{t('Reconciled with')}</SectionTitle>
          {matched.length === 0 && <Text style={{ color: colors.muted }}>{t('Not matched with any document yet.')}</Text>}
          {matched.map(({ r, other }) => (
            <ListItem key={r.id} title={other?.name ?? ''} subtitle={fmtDate(r.date)} right={money(r.amount)} onPress={() => other && router.push({ pathname: '/moves/[id]', params: { id: other.id } })} />
          ))}
        </>
      )}
    </Screen>
  );
}
