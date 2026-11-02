import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useStore } from '../../data/store';
import { correctInvoice, isSaleDoc, MOVE_TYPE_LABELS, reverseMove } from '../../domain/engine';
import { today } from '../../domain/utils';
import { useT } from '../../i18n';
import { Button, Card, Screen } from '../../ui/components';
import { DateField, Segmented, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function ReverseScreen() {
  // intent: 'cancel' = full credit note that cancels the document; 'correct' = credit note + new draft copy.
  const { id, intent } = useLocalSearchParams<{ id: string; intent?: 'cancel' | 'correct' }>();
  const s = useBooks();
  const { runWith } = useStore();
  const { t } = useT();
  const move = s.moves.find((m) => m.id === id);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  if (!move) return null;
  const isEntry = move.moveType === 'entry';
  const fixed = !!intent; // cancel and correct always issue a full credit note
  const title = t(
    intent === 'correct' ? 'Correct Invoice' : intent === 'cancel' ? 'Cancel with Credit Note' : isEntry ? 'Reverse Entry' : isSaleDoc(move.moveType) ? 'Credit Note' : 'Vendor Credit Note',
  );

  const submit = () => {
    if (intent === 'correct') {
      const draftId = runWith(
        (st) => {
          const r = correctInvoice(st, move.id, { date, reason });
          return { state: r.state, value: r.draft.id };
        },
        { requires: 'editDocuments', audit: { action: 'Corrected with credit note and new invoice', ref: move.name } },
      );
      if (draftId) router.replace({ pathname: '/moves/[id]', params: { id: draftId } });
      return;
    }
    const newId = runWith(
      (st) => {
        const r = reverseMove(st, move.id, { date, reason, post: fixed || mode === 'full' });
        return { state: r.state, value: r.move.id };
      },
      { requires: intent === 'cancel' ? 'deleteDocuments' : undefined, audit: { action: intent === 'cancel' ? 'Cancelled with credit note' : isEntry ? 'Reversed' : 'Credit note issued', ref: move.name } },
    );
    if (newId) router.replace({ pathname: '/moves/[id]', params: { id: newId } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title, presentation: 'modal' }} />
      <Card>
        <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: space.md }}>
          {t(MOVE_TYPE_LABELS[move.moveType])} {move.name}
        </Text>
        {intent === 'correct' && (
          <Text style={{ color: colors.muted, marginBottom: space.md }}>
            {t('An issued tax invoice cannot be changed. A full credit note cancels it, and a copy opens as a new draft for the corrected invoice, which gets its own number.')}
          </Text>
        )}
        {!isEntry && !fixed && (
          <Segmented
            label={t('Mode')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'full', label: t('Full refund') },
              { value: 'partial', label: t('Partial (draft)') },
            ]}
          />
        )}
        <Text style={{ color: colors.muted, marginBottom: space.md }}>
          {t(
            fixed || mode === 'full'
              ? 'The reversal is posted and fully reconciled with the original document.'
              : 'A draft is created so you can adjust the lines and amounts before confirming.',
          )}
        </Text>
        <TextField label={t('Reason')} required={isSaleDoc(move.moveType)} value={reason} onChange={setReason} placeholder={t('e.g. Damaged goods')} />
        <DateField label={t('Reversal Date')} value={date} onChange={setDate} />
        <Button testID="reverse-submit" title={intent ? title : isEntry ? t('Reverse') : `${t('Create')} ${title}`} icon="checkmark" onPress={submit} />
      </Card>
    </Screen>
  );
}
