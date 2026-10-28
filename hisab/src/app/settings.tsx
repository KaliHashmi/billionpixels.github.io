import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ENV } from '../config/env';
import { migrate } from '../data/persistence';
import { useBooks, useStore } from '../data/store';
import { Settings } from '../domain/types';
import { isValidISODate, today } from '../domain/utils';
import { accountOptions, taxOptions } from '../features/entities';
import { makeBackup, pickTextFile, readBackup, shareTextFile } from '../services/files';
import { Button, ButtonRow, Card, Row, Screen, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { SelectField, SwitchField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function SettingsScreen() {
  const s = useBooks();
  const { run, replace } = useStore();
  const [form, setForm] = useState<Settings>(s.settings);
  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });
  const [lockOn, setLockOn] = useState(!!s.settings.lockDate);

  const save = () => {
    for (const d of [form.lockDate, form.taxLockDate]) {
      if (d && !isValidISODate(d)) return notify('Invalid date', 'Lock dates must use the YYYY-MM-DD format.');
    }
    if (!form.companyName.trim()) return notify('Missing field', 'Company name is required.');
    if (run((st) => ({ ...st, settings: { ...form, lockDate: lockOn ? form.lockDate : undefined } }))) notify('Saved', 'Settings updated.');
  };

  const backup = () => shareTextFile(`hisab-backup-${today()}.json`, makeBackup(s), 'application/json').catch((e) => notify('Backup failed', String(e)));

  const restore = async () => {
    try {
      const text = await pickTextFile(['application/json', '*/*']);
      if (!text) return;
      const state = migrate(readBackup(text));
      if (await confirm('Restore backup', `Replace ALL current data with the backup of "${state.settings.companyName}"? This cannot be undone.`, 'Restore', true)) {
        await replace(state);
        router.replace('/');
      }
    } catch (e) {
      notify('Restore failed', e instanceof Error ? e.message : String(e));
    }
  };

  const reset = async () => {
    if (!(await confirm('Delete company', 'This permanently deletes all accounting data on this device. Export a backup first!', 'Delete Everything', true))) return;
    if (!(await confirm('Are you absolutely sure?', 'All invoices, bills, payments and settings will be erased.', 'Yes, erase', true))) return;
    await replace(null);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Card>
        <SectionTitle>Company</SectionTitle>
        <Text style={{ height: space.sm }} />
        <TextField label="Company Name" value={form.companyName} onChange={(v) => set({ companyName: v })} required />
        <TextField label="Address" value={form.companyAddress} onChange={(v) => set({ companyAddress: v })} multiline />
        <TextField label="Email" value={form.companyEmail} onChange={(v) => set({ companyEmail: v })} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Phone" value={form.companyPhone} onChange={(v) => set({ companyPhone: v })} keyboardType="phone-pad" />
        <TextField label="Tax ID / VAT Number" value={form.companyTaxId} onChange={(v) => set({ companyTaxId: v })} />
        <Row label="Currency" value={`${form.currency} (${form.decimals} decimals)`} />
        <TextField label="Currency Symbol" value={form.currencySymbol} onChange={(v) => set({ currencySymbol: v })} />
        <SelectField label="Fiscal Year Ends" value={String(form.fiscalYearLastMonth)} allowClear={false} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: `${m} (end of month)` }))} onChange={(v) => v && set({ fiscalYearLastMonth: Number(v) })} />
        <TextField label="Invoice Footer" value={form.invoiceFooter} onChange={(v) => set({ invoiceFooter: v })} multiline />
      </Card>

      <Card>
        <SectionTitle>Lock Dates</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>Prevent any change to entries on or before these dates, e.g. after closing a month or filing a tax return.</Text>
        <SwitchField label="Lock entries" value={lockOn} onChange={(v) => { setLockOn(v); if (v && !form.lockDate) set({ lockDate: today() }); }} />
        {lockOn && <TextField label="Lock Date (YYYY-MM-DD)" value={form.lockDate ?? ''} onChange={(v) => set({ lockDate: v || undefined })} />}
        <TextField label="Tax Lock Date (YYYY-MM-DD)" value={form.taxLockDate ?? ''} onChange={(v) => set({ taxLockDate: v || undefined })} placeholder="Set automatically when closing taxes" />
      </Card>

      <Card>
        <SectionTitle>Defaults</SectionTitle>
        <Text style={{ height: space.sm }} />
        <SelectField label="Default Sales Tax" value={form.defaultSaleTaxId} options={taxOptions(s, 'sale')} onChange={(v) => set({ defaultSaleTaxId: v })} />
        <SelectField label="Default Purchase Tax" value={form.defaultPurchaseTaxId} options={taxOptions(s, 'purchase')} onChange={(v) => set({ defaultPurchaseTaxId: v })} />
        <SelectField label="Default Payment Terms" value={form.defaultPaymentTermId} options={s.paymentTerms.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ defaultPaymentTermId: v })} />
        <SelectField label="Receivable Account" required value={form.receivableAccountId} options={accountOptions(s, (a) => a.type === 'asset_receivable')} onChange={(v) => v && set({ receivableAccountId: v })} />
        <SelectField label="Payable Account" required value={form.payableAccountId} options={accountOptions(s, (a) => a.type === 'liability_payable')} onChange={(v) => v && set({ payableAccountId: v })} />
        <SelectField label="Outstanding Receipts" required value={form.outstandingReceiptsAccountId} options={accountOptions(s, (a) => a.reconcile)} onChange={(v) => v && set({ outstandingReceiptsAccountId: v })} />
        <SelectField label="Outstanding Payments" required value={form.outstandingPaymentsAccountId} options={accountOptions(s, (a) => a.reconcile)} onChange={(v) => v && set({ outstandingPaymentsAccountId: v })} />
        <SelectField label="Tax Settlement Account" required value={form.taxSettlementAccountId} options={accountOptions(s)} onChange={(v) => v && set({ taxSettlementAccountId: v })} />
      </Card>

      <Button title="Save Settings" icon="checkmark" onPress={save} />

      <Card>
        <SectionTitle>Data</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>
          Your books are stored on this device. Export a backup regularly and keep it somewhere safe (email, Drive, iCloud).
        </Text>
        <ButtonRow>
          <Button small title="Export Backup" icon="cloud-upload-outline" onPress={backup} />
          <Button small variant="secondary" title="Restore Backup" icon="cloud-download-outline" onPress={restore} />
          <Button small variant="danger" title="Delete Company" icon="trash-outline" onPress={reset} />
        </ButtonRow>
      </Card>

      <Card>
        <SectionTitle>About</SectionTitle>
        <Row label="Version" value={ENV.version} />
        <Row label="Environment" value={ENV.variant} valueStyle={{ color: ENV.isProduction ? colors.success : ENV.bannerColor, fontWeight: '700' }} />
        <Row label="Database" value={ENV.databaseName} />
        <Row label="Records" value={`${s.moves.length} entries · ${s.partners.length} contacts`} />
      </Card>
    </Screen>
  );
}
