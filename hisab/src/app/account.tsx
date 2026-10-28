import * as LocalAuthentication from 'expo-local-authentication';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { storage } from '../data/storage';
import { useStore } from '../data/store';
import { isAdmin, ROLE_LABELS } from '../domain/auth';
import { BIOMETRIC_PREF, ChangePasswordForm } from '../features/Auth';
import { useT } from '../i18n';
import { Button, Card, MenuItem, Row, Screen, SectionTitle } from '../ui/components';
import { notify } from '../ui/dialog';
import { SwitchField } from '../ui/fields';
import { colors } from '../ui/theme';

export default function AccountScreen() {
  const { user, logout } = useStore();
  const { t, fmtDate } = useT();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);

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
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{t('Hisab locks automatically after 5 minutes in the background.')}</Text>
    </Screen>
  );
}
