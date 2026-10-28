import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useStore } from '../../data/store';
import { MOVE_TYPE_LABELS, reverseMove } from '../../domain/engine';
import { today } from '../../domain/utils';
import { Button, Card, Screen } from '../../ui/components';
import { DateField, Segmented, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function ReverseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { runWith } = useStore();
  const move = s.moves.find((m) => m.id === id);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  if (!move) return null;
  const isEntry = move.moveType === 'entry';
  const title = isEntry ? 'Reverse Entry' : move.moveType === 'out_invoice' ? 'Credit Note' : 'Refund';

  const submit = () => {
    const newId = runWith((st) => {
      const r = reverseMove(st, move.id, { date, reason, post: mode === 'full' });
      return { state: r.state, value: r.move.id };
    });
    if (newId) router.replace({ pathname: '/moves/[id]', params: { id: newId } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title, presentation: 'modal' }} />
      <Card>
        <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: space.md }}>
          {MOVE_TYPE_LABELS[move.moveType]} {move.name}
        </Text>
        {!isEntry && (
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'full', label: 'Full refund' },
              { value: 'partial', label: 'Partial (draft)' },
            ]}
          />
        )}
        <Text style={{ color: colors.muted, marginBottom: space.md }}>
          {mode === 'full'
            ? 'The reversal is posted and fully reconciled with the original document.'
            : 'A draft is created so you can adjust the lines and amounts before confirming.'}
        </Text>
        <TextField label="Reason" value={reason} onChange={setReason} placeholder="e.g. Damaged goods" />
        <DateField label="Reversal Date" value={date} onChange={setDate} />
        <Button title={isEntry ? 'Reverse' : `Create ${title}`} icon="checkmark" onPress={submit} />
      </Card>
    </Screen>
  );
}
