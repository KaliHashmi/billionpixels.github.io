import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENV } from '../config/env';
import { useStore } from '../data/store';
import { migrate } from '../data/persistence';
import { createDemoCompany } from '../domain/seed';
import { createCompany, CURRENCIES } from '../domain/template';
import { pickTextFile, readBackup } from '../services/files';
import { Button, Card, Screen } from '../ui/components';
import { notify } from '../ui/dialog';
import { NumberField, SelectField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Onboarding() {
  const { replace } = useStore();
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [vatRate, setVatRate] = useState(15);
  const [lastMonth, setLastMonth] = useState('12');

  const create = () => {
    if (!companyName.trim()) {
      notify('Company name required', 'Please enter the name of your company.');
      return;
    }
    replace(createCompany({ companyName: companyName.trim(), currency, vatRate, fiscalYearLastMonth: Number(lastMonth) }));
  };

  const restore = async () => {
    try {
      const text = await pickTextFile(['application/json', '*/*']);
      if (text) await replace(migrate(readBackup(text)));
    } catch (e) {
      notify('Restore failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 72, height: 72, borderRadius: 16 }} />
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary, marginTop: space.md }}>Hisab</Text>
          <Text style={{ color: colors.muted, marginTop: 4, textAlign: 'center' }}>
            Invoicing, bills, bank reconciliation, taxes and financial reports — in your pocket.
          </Text>
        </View>
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: space.md }}>Set up your company</Text>
          <TextField label="Company Name" value={companyName} onChange={setCompanyName} required autoCapitalize="words" />
          <SelectField
            label="Currency"
            value={currency}
            required
            onChange={(v) => v && setCurrency(v)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
          />
          <NumberField label="Standard VAT / Sales Tax rate (%)" value={vatRate} onChange={setVatRate} />
          <SelectField
            label="Fiscal year ends in"
            value={lastMonth}
            required
            onChange={(v) => v && setLastMonth(v)}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
          <Button title="Create Company" icon="checkmark" onPress={create} />
        </Card>
        <Button title="Restore from Backup" icon="cloud-download-outline" variant="secondary" onPress={restore} />
        {ENV.allowDemoData && (
          <Button title={`Load Demo Company (${ENV.label})`} icon="flask-outline" variant="secondary" onPress={() => replace(createDemoCompany())} />
        )}
        <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>
          Version {ENV.version}
          {ENV.label ? ` · ${ENV.label} environment` : ''}
        </Text>
      </Screen>
    </SafeAreaView>
  );
}
