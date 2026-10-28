import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useBooks, useMoney, useStore } from '../../../data/store';
import { invoiceStatus, isInvoice } from '../../../domain/engine';
import { Partner } from '../../../domain/types';
import { EntityDef, ENTITIES, FieldDef, isReferenced } from '../../../features/entities';
import { isAdmin } from '../../../domain/auth';
import { useT } from '../../../i18n';
import { Button, ButtonRow, Card, Row, Screen, SectionTitle } from '../../../ui/components';
import { confirm, notify } from '../../../ui/dialog';
import { MultiSelectField, NumberField, SelectField, SwitchField, TextField } from '../../../ui/fields';
import { space } from '../../../ui/theme';

type Rec = { id: string; active: boolean } & Record<string, unknown>;

/** Configuration that affects how everything is posted. */
const ADMIN_ONLY = ['accounts', 'journals', 'taxes'];

export default function EntityForm() {
  const params = useLocalSearchParams<{ entity: string; id: string; kind?: string }>();
  const def = ENTITIES[params.entity] as EntityDef<Rec> | undefined;
  const s = useBooks();
  const { run, user } = useStore();
  const { t } = useT();
  const existing = def && params.id !== 'new' ? (s[def.collection] as unknown as Rec[]).find((r) => r.id === params.id) : undefined;
  const [rec, setRec] = useState<Rec | undefined>(() => existing ?? def?.create(s, params));
  if (!def || !rec) return null;
  const set = (key: string, value: unknown) => setRec({ ...rec, [key]: value });

  const save = () => {
    if (ADMIN_ONLY.includes(def.collection) && !isAdmin(user?.role)) {
      notify(t('Administrators only'), t('Only an administrator can change the chart of accounts, journals and taxes.'));
      return;
    }
    for (const f of def.fields) {
      const v = rec[f.key];
      if (f.required && (v === undefined || v === '' || (typeof v === 'string' && !v.trim()))) {
        notify(t('Missing field'), t('{field} is required.', { field: t(f.label) }));
        return;
      }
    }
    const err = def.validate?.(rec, s);
    if (err) {
      notify(t('Validation Error'), t(err));
      return;
    }
    const ok = run((st) => {
      const list = st[def.collection] as unknown as Rec[];
      const next = list.some((r) => r.id === rec.id) ? list.map((r) => (r.id === rec.id ? rec : r)) : [...list, rec];
      return { ...st, [def.collection]: next };
    });
    if (ok) router.back();
  };

  const remove = async () => {
    if (ADMIN_ONLY.includes(def.collection) && !isAdmin(user?.role)) {
      notify(t('Administrators only'), t('Only an administrator can change the chart of accounts, journals and taxes.'));
      return;
    }
    if (isReferenced(s, def.collection, rec.id)) {
      if (await confirm(t('In use'), t('This record is used in your books, so it can only be archived.'), t('Archive'))) {
        run((st) => ({ ...st, [def.collection]: (st[def.collection] as unknown as Rec[]).map((r) => (r.id === rec.id ? { ...r, active: false } : r)) }));
        router.back();
      }
      return;
    }
    if (await confirm(t('Delete'), t('Delete this record?'), t('Delete'), true)) {
      run((st) => ({ ...st, [def.collection]: (st[def.collection] as unknown as Rec[]).filter((r) => r.id !== rec.id) }));
      router.back();
    }
  };

  const sections: (string | undefined)[] = [];
  for (const f of def.fields) if (!sections.includes(f.section)) sections.push(f.section);

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? def.display(rec, t) || t(def.singular) : `${t('New')} ${t(def.singular)}` }} />
      {params.entity === 'partners' && existing && <PartnerSummary partner={existing as unknown as Partner} />}
      {sections.map((section) => (
        <Card key={section ?? 'main'}>
          {section && <SectionTitle>{t(section)}</SectionTitle>}
          <Text style={{ height: section ? space.sm : 0 }} />
          {def.fields.filter((f) => f.section === section).map((f) => (
            <FieldInput key={f.key} field={f} value={rec[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </Card>
      ))}
      <ButtonRow>
        <Button title={t('Save')} icon="checkmark" onPress={save} style={{ flex: 1 }} />
        {existing && <Button title={t('Delete')} variant="secondary" icon="trash-outline" onPress={remove} />}
      </ButtonRow>
    </Screen>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef<Rec>; value: unknown; onChange: (v: unknown) => void }) {
  const s = useBooks();
  const { t } = useT();
  const options = useMemo(() => field.options?.(s, t) ?? [], [field, s, t]);
  const label = t(field.label);
  switch (field.type) {
    case 'text':
    case 'multiline':
      return <TextField label={label} value={(value as string) ?? ''} onChange={onChange} required={field.required} multiline={field.type === 'multiline'} keyboardType={field.keyboard} autoCapitalize={field.keyboard === 'email-address' ? 'none' : undefined} />;
    case 'number':
      return <NumberField label={label} value={(value as number) ?? 0} onChange={onChange} required={field.required} />;
    case 'bool':
      return <SwitchField label={label} value={!!value} onChange={onChange} hint={field.hint ? t(field.hint) : undefined} />;
    case 'select':
      return <SelectField label={label} value={value as string | undefined} options={options} onChange={onChange} required={field.required} />;
    case 'multi':
      return <MultiSelectField label={label} value={(value as string[]) ?? []} options={options} onChange={onChange} />;
  }
}

function PartnerSummary({ partner }: { partner: Partner }) {
  const s = useBooks();
  const money = useMoney();
  const { t } = useT();
  const stats = useMemo(() => {
    let invoiced = 0;
    let receivable = 0;
    let billed = 0;
    let payable = 0;
    for (const m of s.moves) {
      if (m.partnerId !== partner.id || m.state !== 'posted' || !isInvoice(m.moveType)) continue;
      const st = invoiceStatus(s, m);
      const sign = m.moveType.endsWith('refund') ? -1 : 1;
      if (m.moveType.startsWith('out')) {
        invoiced += sign * st.total;
        receivable += sign * st.residual;
      } else {
        billed += sign * st.total;
        payable += sign * st.residual;
      }
    }
    return { invoiced, receivable, billed, payable };
  }, [s, partner.id]);
  return (
    <Card>
      {partner.isCustomer && (
        <>
          <Row label={t('Invoiced')} value={money(stats.invoiced)} />
          <Row label={t('Due from customer')} value={money(stats.receivable)} bold />
        </>
      )}
      {partner.isVendor && (
        <>
          <Row label={t('Billed')} value={money(stats.billed)} />
          <Row label={t('Due to vendor')} value={money(stats.payable)} bold />
        </>
      )}
      <ButtonRow>
        {partner.isCustomer && <Button small variant="secondary" title={t('Invoices')} icon="document-text-outline" onPress={() => router.push({ pathname: '/moves', params: { type: 'out_invoice', partnerId: partner.id } })} />}
        {partner.isVendor && <Button small variant="secondary" title={t('Purchase Invoices')} icon="receipt-outline" onPress={() => router.push({ pathname: '/moves', params: { type: 'in_invoice', partnerId: partner.id } })} />}
        {partner.isCustomer && <Button small variant="secondary" title={t('Follow-up')} icon="alarm-outline" onPress={() => router.push({ pathname: '/followups/[id]', params: { id: partner.id } })} />}
      </ButtonRow>
    </Card>
  );
}
