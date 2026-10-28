import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENV } from '../config/env';
import { migrate } from '../data/persistence';
import { useStore } from '../data/store';
import { createDemoCompany } from '../domain/seed';
import { COUNTRIES, createCompany, CURRENCIES } from '../domain/template';
import { useT } from '../i18n';
import { monthName } from '../i18n/translate';
import { pickTextFile, readBackup } from '../services/files';
import { Button, Card, Screen } from '../ui/components';
import { notify } from '../ui/dialog';
import { NumberField, Segmented, SelectField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

export default function Onboarding() {
  const { replace } = useStore();
  const { t, lang, setLang } = useT();
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('OM');
  const [currency, setCurrency] = useState('OMR');
  const [vatRate, setVatRate] = useState(5);
  const [lastMonth, setLastMonth] = useState('12');

  const chooseCountry = (code: string) => {
    const c = COUNTRIES.find((x) => x.code === code);
    setCountry(code);
    if (c) {
      setCurrency(c.currency);
      setVatRate(c.vatRate);
    }
  };

  const create = () => {
    if (!companyName.trim()) {
      notify(t('Company name required'), t('Please enter the name of your company.'));
      return;
    }
    replace(createCompany({ companyName: companyName.trim(), currency, vatRate, country, fiscalYearLastMonth: Number(lastMonth) }));
  };

  const restore = async () => {
    try {
      const text = await pickTextFile(['application/json', '*/*']);
      if (text) await replace(migrate(readBackup(text)));
    } catch (e) {
      notify(t('Restore failed'), t(e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
      <Screen>
        <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
        <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 16 }} />
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: space.md }}>{t('Hisab')}</Text>
          <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'center' }}>
            {t('Invoicing, bills, bank reconciliation, taxes and financial reports — in your pocket.')}
          </Text>
        </View>
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: space.md }}>{t('Set up your company')}</Text>
          <TextField label={t('Company Name')} value={companyName} onChange={setCompanyName} required autoCapitalize="words" />
          <SelectField label={t('Country')} value={country} required onChange={(v) => v && chooseCountry(v)} options={COUNTRIES.map((c) => ({ value: c.code, label: t(c.name) }))} />
          <SelectField
            label={t('Currency')}
            value={currency}
            required
            onChange={(v) => v && setCurrency(v)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${t(c.name)}` }))}
          />
          <NumberField label={t('Standard VAT rate (%)')} value={vatRate} onChange={setVatRate} />
          <SelectField
            label={t('Fiscal year ends in')}
            value={lastMonth}
            required
            onChange={(v) => v && setLastMonth(v)}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(lang, i) }))}
          />
          <Button title={t('Create Company')} icon="checkmark" onPress={create} />
        </Card>
        <Button title={t('Restore from Backup')} icon="cloud-download-outline" variant="secondary" onPress={restore} />
        {ENV.allowDemoData && (
          <Button title={`${t('Load Demo Company')} (${ENV.label})`} icon="flask-outline" variant="secondary" onPress={() => replace(createDemoCompany())} />
        )}
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>
          {t('Version')} {ENV.version}
          {ENV.label ? ` · ${ENV.label}` : ''}
        </Text>
      </Screen>
    </SafeAreaView>
  );
}
