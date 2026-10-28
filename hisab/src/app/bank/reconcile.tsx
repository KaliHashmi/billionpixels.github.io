import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useBooks, useLookups, useMoney, useStore } from '../../data/store';
import { deleteStatementLine, reconcileStatementLine, suggestMatches, undoStatementReconciliation } from '../../domain/engine';
import { formatDate, round } from '../../domain/utils';
import { accountOptions, partnerOptions, taxOptions } from '../../features/entities';
import { Button, ButtonRow, Card, Divider, Row, Screen, SearchBar, SectionTitle } from '../../ui/components';
import { confirm } from '../../ui/dialog';
import { SelectField, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function ReconcileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run } = useStore();
  const lk = useLookups();
  const money = useMoney();
  const sl = s.statementLines.find((l) => l.id === id);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [partnerId, setPartnerId] = useState(sl?.partnerId);
  const [accountId, setAccountId] = useState<string | undefined>();
  const [taxId, setTaxId] = useState<string | undefined>();
  const [label, setLabel] = useState(sl?.label ?? '');
  const candidates = useMemo(() => (sl ? suggestMatches(s, { ...sl, partnerId }) : []), [s, sl, partnerId]);
  if (!sl) return null;

  const d = s.settings.decimals;
  const picked = candidates.filter((c) => selected.includes(c.line.id));
  let remaining = sl.amount;
  for (const c of picked) {
    if (Math.sign(c.residual) !== Math.sign(remaining) || round(remaining, d) === 0) continue;
    remaining = round(remaining - Math.sign(c.residual) * Math.min(Math.abs(c.residual), Math.abs(remaining)), d);
  }
  const term = q.trim().toLowerCase();
  const visible = candidates.filter(
    (c) => !term || c.move.name.toLowerCase().includes(term) || c.move.ref.toLowerCase().includes(term) || (c.line.partnerId && lk.partners.get(c.line.partnerId)?.name.toLowerCase().includes(term)) || String(Math.abs(c.residual)).includes(term),
  );

  const validate = () => {
    const ok = run((st) => {
      const withPartner = partnerId !== sl.partnerId ? { ...st, statementLines: st.statementLines.map((l) => (l.id === sl.id ? { ...l, partnerId } : l)) } : st;
      return reconcileStatementLine(withPartner, sl.id, selected, round(remaining, d) !== 0 && accountId ? { accountId, label, taxId } : undefined);
    });
    if (ok) router.back();
  };

  if (sl.reconciled) {
    const move = s.moves.find((m) => m.id === sl.moveId);
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Reconciled Transaction' }} />
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>{sl.label}</Text>
          <Row label="Date" value={formatDate(sl.date)} />
          <Row label="Amount" value={money(sl.amount)} bold />
          {move && <Row label="Journal Entry" value={move.name} onPress={() => router.push({ pathname: '/moves/[id]', params: { id: move.id } })} />}
          {move?.lines.slice(1).map((l) => (
            <Row key={l.id} label={`${lk.accounts.get(l.accountId)?.code} ${l.label}`} value={money(l.credit - l.debit)} />
          ))}
          <ButtonRow>
            <Button
              small
              variant="secondary"
              title="Undo Reconciliation"
              icon="arrow-undo-outline"
              onPress={async () => {
                if (await confirm('Undo reconciliation', 'The generated journal entry will be deleted and the matched documents become open again.', 'Undo')) run((st) => undoStatementReconciliation(st, sl.id));
              }}
            />
          </ButtonRow>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Reconcile' }} />
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>{sl.label || '—'}</Text>
        <Row label={formatDate(sl.date)} value={money(sl.amount)} bold valueStyle={{ color: sl.amount >= 0 ? colors.success : colors.danger }} />
        <SelectField label="Partner" value={partnerId} options={partnerOptions(s)} onChange={setPartnerId} />
        <Divider />
        <Row label="Matched" value={money(round(sl.amount - remaining, d))} />
        <Row label="Remaining to explain" value={money(remaining)} bold valueStyle={{ color: round(remaining, d) === 0 ? colors.success : colors.warning }} />
        <ButtonRow>
          <Button small title="Validate" icon="checkmark-done" onPress={validate} disabled={round(remaining, d) !== 0 && !accountId} />
          <Button small variant="secondary" title="Edit" icon="create-outline" onPress={() => router.push({ pathname: '/bank/line', params: { id: sl.id } })} />
          <Button
            small
            variant="ghost"
            title="Delete"
            onPress={async () => {
              if ((await confirm('Delete transaction', 'Delete this bank transaction?', 'Delete', true)) && run((st) => deleteStatementLine(st, sl.id))) router.back();
            }}
          />
        </ButtonRow>
      </Card>

      {round(remaining, d) !== 0 && (
        <Card>
          <SectionTitle>Counterpart for the remaining {money(remaining)}</SectionTitle>
          <Text style={{ color: colors.muted, marginVertical: space.sm }}>Book the difference on an account, e.g. bank fees, rent or miscellaneous income.</Text>
          <SelectField label="Account" value={accountId} options={accountOptions(s, (a) => a.type !== 'asset_cash')} onChange={setAccountId} />
          <SelectField label="Tax (amount is tax-included)" value={taxId} options={taxOptions(s, remaining < 0 ? 'purchase' : 'sale')} onChange={setTaxId} />
          <TextField label="Label" value={label} onChange={setLabel} />
        </Card>
      )}

      <SectionTitle>Match with open items</SectionTitle>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search invoices, bills, payments…" />
      {visible.length === 0 && <Text style={{ color: colors.muted }}>No open invoices, bills or payments in this direction.</Text>}
      {visible.slice(0, 50).map((c) => {
        const active = selected.includes(c.line.id);
        return (
          <Pressable key={c.line.id} onPress={() => setSelected(active ? selected.filter((x) => x !== c.line.id) : [...selected, c.line.id])}>
            <Card style={active ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600' }}>{c.move.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {[c.line.partnerId ? lk.partners.get(c.line.partnerId)?.name : '', formatDate(c.move.date), c.move.origin === 'payment' ? 'Payment' : c.move.ref].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={{ fontWeight: '700' }}>{money(Math.abs(c.residual))}</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
