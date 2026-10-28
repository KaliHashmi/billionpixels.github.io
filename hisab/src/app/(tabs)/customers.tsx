import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useBooks } from '../../data/store';
import { useT } from '../../i18n';
import { MenuItem, Screen, SectionTitle } from '../../ui/components';

export default function CustomersMenu() {
  const s = useBooks();
  const { t } = useT();
  const drafts = useMemo(() => s.moves.filter((m) => m.moveType === 'out_invoice' && m.state === 'draft').length, [s.moves]);
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <SectionTitle>{t('Customers')}</SectionTitle>
      </View>
      <MenuItem icon="document-text-outline" title={t('Sales Invoices')} count={drafts} onPress={() => router.push({ pathname: '/moves', params: { type: 'out_invoice' } })} />
      <MenuItem icon="return-down-back-outline" title={t('Credit Notes')} onPress={() => router.push({ pathname: '/moves', params: { type: 'out_refund' } })} />
      <MenuItem icon="arrow-down-circle-outline" title={t('Customer Receipts')} subtitle={t('Receipt vouchers')} onPress={() => router.push({ pathname: '/payments', params: { partnerType: 'customer' } })} />
      <MenuItem icon="alarm-outline" title={t('Follow-up')} subtitle={t('Overdue invoices & reminders')} onPress={() => router.push('/followups')} />
      <MenuItem icon="cube-outline" title={t('Products')} onPress={() => router.push('/config/products')} />
      <MenuItem icon="people-outline" title={t('Customers')} onPress={() => router.push({ pathname: '/config/[entity]', params: { entity: 'partners', kind: 'customer' } })} />
    </Screen>
  );
}
