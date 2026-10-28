import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useBooks, useMoney, useStore } from '../../data/store';
import { confirmAsset, deleteAsset, depreciationBoard, postDepreciations, saveAsset } from '../../domain/assets';
import { Asset } from '../../domain/types';
import { newId, startOfMonth, today } from '../../domain/utils';
import { accountOptions, journalOptions } from '../../features/entities';
import { useT } from '../../i18n';
import { Badge, Button, ButtonRow, Card, Row, Screen, SectionTitle } from '../../ui/components';
import { confirm } from '../../ui/dialog';
import { DateField, NumberField, SelectField, TextField } from '../../ui/fields';
import { colors } from '../../ui/theme';

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const money = useMoney();
  const { t, fmtDate: formatDate } = useT();
  const stored = s.assets.find((a) => a.id === id);
  const acc = (code: string) => s.accounts.find((a) => a.code === code)?.id ?? '';
  const [draft, setDraft] = useState<Asset>(
    () =>
      stored ?? {
        id: newId(),
        name: '',
        acquisitionDate: today(),
        firstDepreciationDate: startOfMonth(today()),
        originalValue: 0,
        salvageValue: 0,
        durationMonths: 60,
        assetAccountId: acc('151000'),
        depreciationAccountId: acc('151100'),
        expenseAccountId: acc('620000'),
        journalId: s.journals.find((j) => j.type === 'general')?.id ?? '',
        state: 'draft',
        depreciationMoveIds: [],
        notes: '',
      },
  );
  const asset = stored && stored.state !== 'draft' ? stored : draft;
  const editable = asset.state === 'draft';
  const set = (patch: Partial<Asset>) => setDraft({ ...draft, ...patch });
  const board = asset.originalValue > 0 && asset.durationMonths >= 1 ? depreciationBoard(asset, s.settings.decimals) : [];

  const save = () => {
    if (run((st) => saveAsset(st, draft)) && !stored) router.setParams({ id: draft.id });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: stored ? asset.name : t('New Asset') }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '800' }}>{asset.name || t('New Asset')}</Text>
          <Badge label={t(asset.state === 'draft' ? 'Draft' : asset.state === 'running' ? 'Running' : 'Closed')} tone={asset.state} />
        </View>
        <ButtonRow>
          {editable && <Button small title={t('Save')} icon="save-outline" onPress={save} />}
          {editable && stored && <Button small title={t('Confirm')} icon="checkmark" onPress={() => run((st) => confirmAsset(saveAsset(st, draft), draft.id))} />}
          {asset.state === 'running' && <Button small title={t('Post due depreciation')} icon="flash-outline" onPress={() => run((st) => postDepreciations(st, asset.id, today()))} />}
          {editable && stored && (
            <Button
              small
              variant="ghost"
              title={t('Delete')}
              onPress={async () => {
                if ((await confirm(t('Delete'), t('Delete this draft asset?'), t('Delete'), true)) && run((st) => deleteAsset(st, asset.id))) router.back();
              }}
            />
          )}
        </ButtonRow>
      </Card>
      <Card>
        <TextField label={t('Asset Name')} value={asset.name} onChange={(v) => set({ name: v })} editable={editable} required />
        <NumberField label={t('Original Value')} value={asset.originalValue} onChange={(v) => set({ originalValue: v })} editable={editable} required />
        <NumberField label={t('Not Depreciable Value (salvage)')} value={asset.salvageValue} onChange={(v) => set({ salvageValue: v })} editable={editable} />
        <DateField label={t('Acquisition Date')} value={asset.acquisitionDate} onChange={(v) => set({ acquisitionDate: v })} editable={editable} />
        <DateField label={t('First Depreciation Month')} value={asset.firstDepreciationDate} onChange={(v) => set({ firstDepreciationDate: v })} editable={editable} />
        <NumberField label={t('Duration (months)')} value={asset.durationMonths} onChange={(v) => set({ durationMonths: Math.round(v) })} editable={editable} required />
        <Text style={{ color: colors.muted, marginBottom: 12 }}>{t('Method: straight line, monthly.')}</Text>
        <SelectField label={t('Fixed Asset Account')} value={asset.assetAccountId} options={accountOptions(s, (a) => a.type.startsWith('asset'), t)} onChange={(v) => v && set({ assetAccountId: v })} editable={editable} required />
        <SelectField label={t('Accumulated Depreciation Account')} value={asset.depreciationAccountId} options={accountOptions(s, (a) => a.type.startsWith('asset'), t)} onChange={(v) => v && set({ depreciationAccountId: v })} editable={editable} required />
        <SelectField label={t('Depreciation Expense Account')} value={asset.expenseAccountId} options={accountOptions(s, (a) => a.type.startsWith('expense'), t)} onChange={(v) => v && set({ expenseAccountId: v })} editable={editable} required />
        <SelectField label={t('Journal')} value={asset.journalId} options={journalOptions(s, ['general'], t)} onChange={(v) => v && set({ journalId: v })} editable={editable} required />
      </Card>
      {board.length > 0 && (
        <Card>
          <SectionTitle>{t('Depreciation Board')}</SectionTitle>
          {board.map((r) => (
            <Row
              key={r.index}
              label={`${formatDate(r.date)}${r.moveId ? ' ✓' : ''}`}
              value={`${money(r.amount, false)} · ${t('remaining')} ${money(r.remaining, false)}`}
              valueStyle={r.moveId ? { color: colors.success } : undefined}
              onPress={r.moveId ? () => router.push({ pathname: '/moves/[id]', params: { id: r.moveId! } }) : undefined}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
