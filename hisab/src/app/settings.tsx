import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ENV } from '../config/env';
import { migrate } from '../data/persistence';
import { useBooks, useStore } from '../data/store';
import { COUNTRIES } from '../domain/template';
import { Settings } from '../domain/types';
import { isValidISODate, today } from '../domain/utils';
import { accountOptions, taxOptions, termOptions } from '../features/entities';
import { useT } from '../i18n';
import { monthName } from '../i18n/translate';
import { makeBackup, pickTextFile, readBackup, shareTextFile } from '../services/files';
import { Button, ButtonRow, Card, Row, Screen, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { NumberField, Segmented, SelectField, SwitchField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

type AccountKey = { [K in keyof Settings]-?: Settings[K] extends string ? K : never }[keyof Settings];

export default function SettingsScreen() {
  const s = useBooks();
  const { run, replace } = useStore();
  const { t, lang, setLang } = useT();
  const [form, setForm] = useState<Settings>(s.settings);
  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });
  const [lockOn, setLockOn] = useState(!!s.settings.lockDate);

  const save = () => {
    for (const d of [form.lockDate, form.taxLockDate]) {
      if (d && !isValidISODate(d)) return notify(t('Invalid date'), t('Lock dates must use the YYYY-MM-DD format.'));
    }
    if (!form.companyName.trim()) return notify(t('Missing field'), t('Company name is required.'));
    if (form.country === 'OM' && form.vatRegistered && form.companyTaxId && !/^OM\d{10}$/i.test(form.companyTaxId.replace(/\s/g, ''))) {
      notify(t('Check your VATIN'), t('Omani VAT numbers usually look like OM followed by 10 digits (e.g. OM1100000000).'));
    }
    if (run((st) => ({ ...st, settings: { ...form, lockDate: lockOn ? form.lockDate : undefined } }))) notify(t('Saved'), t('Settings updated.'));
  };

  const backup = () => shareTextFile(`hisab-backup-${today()}.json`, makeBackup(s), 'application/json').catch((e) => notify(t('Backup failed'), String(e)));

  const restore = async () => {
    try {
      const text = await pickTextFile(['application/json', '*/*']);
      if (!text) return;
      const state = migrate(readBackup(text));
      if (await confirm(t('Restore backup'), t('Replace ALL current data with the backup of "{name}"? This cannot be undone.', { name: state.settings.companyName }), t('Restore'), true)) {
        await replace(state);
        router.replace('/');
      }
    } catch (e) {
      notify(t('Restore failed'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  const reset = async () => {
    if (!(await confirm(t('Delete company'), t('This permanently deletes all accounting data on this device. Export a backup first!'), t('Delete Everything'), true))) return;
    if (!(await confirm(t('Are you absolutely sure?'), t('All invoices, bills, payments and settings will be erased.'), t('Yes, erase'), true))) return;
    await replace(null);
  };

  const accountField = (label: string, key: AccountKey, filter?: Parameters<typeof accountOptions>[1]) => (
    <SelectField label={t(label)} required value={form[key] as string} options={accountOptions(s, filter, t)} onChange={(v) => v && set({ [key]: v } as Partial<Settings>)} />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('Settings') }} />
      <Card>
        <SectionTitle>{t('Language')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
      </Card>

      <Card>
        <SectionTitle>{t('Company')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <TextField label={t('Company Name')} value={form.companyName} onChange={(v) => set({ companyName: v })} required />
        <TextField label={t('Company Name (Arabic)')} value={form.companyNameAr} onChange={(v) => set({ companyNameAr: v })} />
        <TextField label={t('Address')} value={form.companyAddress} onChange={(v) => set({ companyAddress: v })} multiline />
        <TextField label={t('Email')} value={form.companyEmail} onChange={(v) => set({ companyEmail: v })} keyboardType="email-address" autoCapitalize="none" />
        <TextField label={t('Phone')} value={form.companyPhone} onChange={(v) => set({ companyPhone: v })} keyboardType="phone-pad" />
        <SelectField label={t('Country')} value={form.country} allowClear={false} options={COUNTRIES.map((c) => ({ value: c.code, label: t(c.name) }))} onChange={(v) => v && set({ country: v })} />
        <Row label={t('Currency')} value={`${form.currency} (${form.decimals} ${t('decimals')})`} />
        <TextField label={t('Currency Symbol')} value={form.currencySymbol} onChange={(v) => set({ currencySymbol: v })} />
        <SelectField
          label={t('Fiscal Year Ends')}
          value={String(form.fiscalYearLastMonth)}
          allowClear={false}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(lang, i) }))}
          onChange={(v) => v && set({ fiscalYearLastMonth: Number(v) })}
        />
        <TextField label={t('Invoice Footer')} value={form.invoiceFooter} onChange={(v) => set({ invoiceFooter: v })} multiline />
      </Card>

      <Card>
        <SectionTitle>{t('VAT')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <SwitchField label={t('VAT registered')} value={form.vatRegistered} onChange={(v) => set({ vatRegistered: v })} hint={t('Invoices are printed as "Tax Invoice" with your VATIN.')} />
        <TextField label={t('VAT Registration Number (VATIN)')} value={form.companyTaxId} onChange={(v) => set({ companyTaxId: v.toUpperCase() })} autoCapitalize="characters" />
        <SelectField label={t('Default Sales Tax')} value={form.defaultSaleTaxId} options={taxOptions(s, 'sale', t)} onChange={(v) => set({ defaultSaleTaxId: v })} />
        <SelectField label={t('Default Purchase Tax')} value={form.defaultPurchaseTaxId} options={taxOptions(s, 'purchase', t)} onChange={(v) => set({ defaultPurchaseTaxId: v })} />
      </Card>

      <Card>
        <SectionTitle>{t('Lock Dates')}</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>{t('Prevent any change to entries on or before these dates, e.g. after closing a month or filing a VAT return.')}</Text>
        <SwitchField
          label={t('Lock entries')}
          value={lockOn}
          onChange={(v) => {
            setLockOn(v);
            if (v && !form.lockDate) set({ lockDate: today() });
          }}
        />
        {lockOn && <TextField label={t('Lock Date (YYYY-MM-DD)')} value={form.lockDate ?? ''} onChange={(v) => set({ lockDate: v || undefined })} />}
        <TextField label={t('VAT Lock Date (YYYY-MM-DD)')} value={form.taxLockDate ?? ''} onChange={(v) => set({ taxLockDate: v || undefined })} placeholder={t('Set automatically when closing a VAT period')} />
      </Card>

      <Card>
        <SectionTitle>{t('Payroll')}</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>{t('Social insurance rates in % of gross salary for insured (Omani) employees. Confirm the current rates with the Social Protection Fund.')}</Text>
        <NumberField label={t('Employee contribution (%)')} value={form.siEmployeeRate} onChange={(v) => set({ siEmployeeRate: v })} />
        <NumberField label={t('Employer contribution (%)')} value={form.siEmployerRate} onChange={(v) => set({ siEmployerRate: v })} />
      </Card>

      <Card>
        <SectionTitle>{t('Default Accounts')}</SectionTitle>
        <Text style={{ height: space.sm }} />
        <SelectField label={t('Default Payment Terms')} value={form.defaultPaymentTermId} options={termOptions(s, t)} onChange={(v) => set({ defaultPaymentTermId: v })} />
        {accountField('Receivable Account', 'receivableAccountId', (a) => a.type === 'asset_receivable')}
        {accountField('Payable Account', 'payableAccountId', (a) => a.type === 'liability_payable')}
        {accountField('Outstanding Receipts', 'outstandingReceiptsAccountId', (a) => a.reconcile)}
        {accountField('Outstanding Payments', 'outstandingPaymentsAccountId', (a) => a.reconcile)}
        {accountField('Cheques Under Collection', 'chequesReceivedAccountId', (a) => a.reconcile)}
        {accountField('Cheques Issued - Pending Clearance', 'chequesIssuedAccountId', (a) => a.reconcile)}
        {accountField('Card Payments Clearing', 'cardClearingAccountId', (a) => a.reconcile)}
        {accountField('Cash Over/Short', 'cashDifferenceAccountId')}
        {accountField('VAT Payable', 'taxSettlementAccountId')}
        {accountField('Salaries & Wages', 'salaryExpenseAccountId')}
        {accountField('Social Insurance Expense', 'siExpenseAccountId')}
        {accountField('Salaries Payable', 'salariesPayableAccountId')}
        {accountField('Social Insurance Payable', 'siPayableAccountId')}
        {accountField('Employee Advances', 'employeeAdvancesAccountId')}
      </Card>

      <Button title={t('Save Settings')} icon="checkmark" onPress={save} />

      <Card>
        <SectionTitle>{t('Data')}</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>
          {t('Your books are stored on this device. Export a backup regularly and keep it somewhere safe (email, Drive, iCloud). Keep your accounting and VAT records for the period required by law.')}
        </Text>
        <ButtonRow>
          <Button small title={t('Export Backup')} icon="cloud-upload-outline" onPress={backup} />
          <Button small variant="secondary" title={t('Restore Backup')} icon="cloud-download-outline" onPress={restore} />
          <Button small variant="danger" title={t('Delete Company')} icon="trash-outline" onPress={reset} />
        </ButtonRow>
      </Card>

      <Card>
        <SectionTitle>{t('About')}</SectionTitle>
        <Row label={t('Version')} value={ENV.version} />
        <Row label={t('Environment')} value={ENV.variant} valueStyle={{ color: ENV.isProduction ? colors.success : ENV.bannerColor, fontWeight: '700' }} />
        <Row label={t('Database')} value={ENV.databaseName} />
        <Row label={t('Records')} value={`${s.moves.length} ${t('entries')} · ${s.partners.length} ${t('contacts')}`} />
      </Card>
    </Screen>
  );
}
