import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { storage } from '../data/storage';
import { useStore } from '../data/store';
import { deleteOwnAccount, isAdmin, ROLE_LABELS } from '../domain/auth';
import { BIOMETRIC_PREF, ChangePasswordForm } from '../features/Auth';
import { useT } from '../i18n';
import { Button, Card, MenuItem, Row, Screen, SectionTitle } from '../ui/components';
import { confirm, notify } from '../ui/dialog';
import { SwitchField, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';
import { LegalLinks } from '../ui/LegalLinks';

export default function AccountScreen() {
  const { user, logout, run } = useStore();
  const { t, fmtDate } = useT();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      setBioAvailable((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
      setBioOn((await storage.getPref(BIOMETRIC_PREF)) === user?.id);
    })().catch(() => undefined);
  }, [user?.id]);

  if (!user) return null;

  const toggleBio = async (on: boolean) => {
    if (on) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: t('Confirm to enable biometric unlock'), cancelLabel: t('Cancel') });
      if (!res.success) return;
    }
    await storage.setPref(BIOMETRIC_PREF, on ? user.id : '');
    setBioOn(on);
    if (on) notify(t('Biometric unlock enabled'), t('Next time, unlock Hisab with Face ID or your fingerprint.'));
  };

  const deleteAccount = async () => {
    const sure = await confirm(
      t('Delete my account'),
      t('Your sign-in and personal details will be permanently deleted from this device. The accounting records stay with the company. This cannot be undone.'),
      t('Delete My Account'),
      true,
    );
    if (!sure) return;
    const { id, username } = user;
    if (!run((s) => deleteOwnAccount(s, id, deletePassword), { allowReadOnly: true, audit: { action: 'Deleted own account', ref: username } })) return;
    // Forget everything this device remembered about the deleted user.
    if ((await storage.getPref('lastUser').catch(() => null)) === username) await storage.setPref('lastUser', '').catch(() => undefined);
    if ((await storage.getPref(BIOMETRIC_PREF).catch(() => null)) === id) await storage.setPref(BIOMETRIC_PREF, '').catch(() => undefined);
    logout();
    notify(t('Account deleted'), t('Your account has been deleted.'));
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('My Account') }} />
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800' }}>{user.name}</Text>
        <Row label={t('Username')} value={user.username} />
        <Row label={t('Role')} value={t(ROLE_LABELS[user.role])} />
        {user.lastLoginAt && <Row label={t('Last sign-in')} value={fmtDate(user.lastLoginAt.slice(0, 10))} />}
        <Button title={t('Sign out')} icon="log-out-outline" variant="secondary" onPress={logout} style={{ marginTop: 8 }} />
      </Card>
      {bioAvailable && (
        <Card>
          <SwitchField label={t('Unlock with Face ID / fingerprint')} value={bioOn} onChange={toggleBio} hint={t('Only on this device.')} />
        </Card>
      )}
      <ChangePasswordForm />
      {isAdmin(user.role) && (
        <>
          <SectionTitle>{t('Administration')}</SectionTitle>
          <MenuItem icon="people-outline" title={t('Users & Access')} onPress={() => router.push('/users')} />
          <MenuItem icon="settings-outline" title={t('Settings')} onPress={() => router.push('/settings')} />
        </>
      )}
      <Card>
        <SectionTitle>{t('Delete My Account')}</SectionTitle>
        <Text style={{ color: colors.muted, marginVertical: space.sm }}>
          {t('Permanently deletes your sign-in and personal details. The invoices and entries you recorded stay in the company books.')}
        </Text>
        <TextField label={t('Password')} value={deletePassword} onChange={setDeletePassword} secure autoCapitalize="none" />
        <Button title={t('Delete My Account')} variant="danger" icon="trash-outline" onPress={deleteAccount} disabled={!deletePassword} />
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{t('Hisab locks automatically after 5 minutes in the background.')}</Text>
      <LegalLinks />
    </Screen>
  );
}
