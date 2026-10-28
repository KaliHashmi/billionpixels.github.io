import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useBooks, useStore } from '../../data/store';
import { isAdmin } from '../../domain/auth';
import { chequeRegister } from '../../domain/management';
import { useT } from '../../i18n';
import { MenuItem, Screen, SectionTitle } from '../../ui/components';

export default function AccountingMenu() {
  const s = useBooks();
  const { user } = useStore();
  const admin = isAdmin(user?.role);
  const { t } = useT();
  const toReconcile = useMemo(() => s.statementLines.filter((l) => !l.reconciled).length, [s.statementLines]);
  const pendingCheques = useMemo(() => chequeRegister(s).filter((c) => c.status === 'pending').length, [s]);
  const bank = s.journals.find((j) => j.type === 'bank' && j.active);
  const section = (title: string) => (
    <View style={{ padding: 16, paddingBottom: 0 }}>
      <SectionTitle>{t(title)}</SectionTitle>
    </View>
  );
  return (
    <Screen contentStyle={{ padding: 0, gap: 0 }}>
      {section('Daily Operations')}
      <MenuItem icon="wallet-outline" title={t('Cash & Bank Book')} subtitle={t('All cash and bank transactions')} onPress={() => router.push('/cashbook')} />
      <MenuItem icon="git-compare-outline" title={t('Bank Reconciliation')} count={toReconcile} onPress={() => router.push({ pathname: '/bank', params: { journalId: bank?.id } })} />
      <MenuItem icon="card-outline" title={t('Cheques')} subtitle={t('Issued, received and pending clearance')} count={pendingCheques} onPress={() => router.push('/cheques')} />
      <MenuItem icon="lock-closed-outline" title={t('Daily Cash Closing')} subtitle={t('Cash count and card settlement')} onPress={() => router.push('/cash-closing')} />
      {section('Accounting')}
      <MenuItem icon="journal-outline" title={t('Journal Entries')} onPress={() => router.push({ pathname: '/moves', params: { type: 'entry' } })} />
      <MenuItem icon="reorder-four-outline" title={t('Journal Items')} onPress={() => router.push('/items')} />
      <MenuItem icon="people-circle-outline" title={t('Payroll')} subtitle={t('Monthly salaries & social insurance')} onPress={() => router.push('/payroll')} />
      <MenuItem icon="car-outline" title={t('Assets')} subtitle={t('Fixed assets & depreciation')} onPress={() => router.push('/assets')} />
      <MenuItem icon="trending-up-outline" title={t('Budgets')} onPress={() => router.push('/budgets')} />
      <MenuItem icon="document-attach-outline" title={t('VAT Return')} subtitle={t('VAT report & tax closing')} onPress={() => router.push('/tax-return')} />
      {section('Configuration')}
      <MenuItem icon="id-card-outline" title={t('Employees')} onPress={() => router.push('/config/employees')} />
      <MenuItem icon="list-outline" title={t('Chart of Accounts')} onPress={() => router.push('/config/accounts')} />
      <MenuItem icon="book-outline" title={t('Journals')} onPress={() => router.push('/config/journals')} />
      <MenuItem icon="pricetag-outline" title={t('Taxes')} onPress={() => router.push('/config/taxes')} />
      <MenuItem icon="time-outline" title={t('Payment Terms')} onPress={() => router.push('/config/paymentTerms')} />
      <MenuItem icon="pie-chart-outline" title={t('Analytic Accounts')} onPress={() => router.push('/config/analyticAccounts')} />
      {admin && <MenuItem icon="people-outline" title={t('Users & Access')} onPress={() => router.push('/users')} />}
      {admin && <MenuItem icon="settings-outline" title={t('Settings')} subtitle={t('Company, language, lock dates, backup')} onPress={() => router.push('/settings')} />}
      {admin && <MenuItem icon="ribbon-outline" title={t('Stamp & Signature')} subtitle={t('Printed on every PDF: invoices, vouchers, reports')} onPress={() => router.push('/stamp')} />}
      <MenuItem icon="person-circle-outline" title={t('My Account')} subtitle={t('Password, sign out')} onPress={() => router.push('/account')} />
    </Screen>
  );
}
