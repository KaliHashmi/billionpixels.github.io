import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENV } from '../config/env';
import { storage } from '../data/storage';
import { randomBytes, useStore } from '../data/store';
import { addUser, changePassword, MIN_PASSWORD_LENGTH } from '../domain/auth';
import { AccountingError } from '../domain/types';
import { useT } from '../i18n';
import { Button, Card, Screen } from '../ui/components';
import { notify } from '../ui/dialog';
import { Segmented, TextField } from '../ui/fields';
import { colors, space } from '../ui/theme';

export const BIOMETRIC_PREF = `biometric:${ENV.databaseName}`;

function Shell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useT();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.primary }} edges={['top']}>
      <Screen>
        <Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]} />
        <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64, borderRadius: 14 }} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primary, marginTop: space.sm }}>{t('Hisab')}</Text>
          {!!ENV.label && <Text style={{ color: ENV.bannerColor, fontWeight: '700' }}>{ENV.label}</Text>}
        </View>
        {children}
      </Screen>
    </SafeAreaView>
  );
}

/** Password field pair with the shared validation message. */
export function NewPasswordFields({ password, confirm, onPassword, onConfirm }: { password: string; confirm: string; onPassword: (v: string) => void; onConfirm: (v: string) => void }) {
  const { t } = useT();
  return (
    <>
      <TextField label={t('Password')} value={password} onChange={onPassword} secure required autoCapitalize="none" />
      <TextField label={t('Confirm Password')} value={confirm} onChange={onConfirm} secure required autoCapitalize="none" />
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: space.md }}>{t('At least {n} characters, with letters and numbers.', { n: MIN_PASSWORD_LENGTH })}</Text>
    </>
  );
}

export function LoginScreen() {
  const { login, startSession, state } = useStore();
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioUser, setBioUser] = useState<string | null>(null);

  // Once per visit: prefill the last user and offer biometric unlock if this device enabled it.
  const users = state?.users;
  useEffect(() => {
    storage.getPref('lastUser').then((u) => u && setUsername((cur) => cur || u)).catch(() => undefined);
    (async () => {
      const id = await storage.getPref(BIOMETRIC_PREF);
      if (!id || !users?.some((u) => u.id === id && u.active)) return;
      if ((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())) setBioUser(id);
    })().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    setBusy(true);
    // Let the spinner render before the (CPU-bound) password check.
    setTimeout(() => {
      const err = login(username, password);
      setBusy(false);
      if (err) {
        setError(t(err));
        setPassword('');
      }
    }, 30);
  };

  const biometric = async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: t('Unlock Hisab'), cancelLabel: t('Cancel') });
    if (res.success && bioUser) startSession(bioUser);
  };

  const demo = ENV.allowDemoData && state?.users.some((u) => u.username === 'admin') && state.settings.companyName.includes('Demo');

  return (
    <Shell>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: space.md }}>{t('Sign in')}</Text>
        <Text style={{ color: colors.muted, marginBottom: space.md }}>{state?.settings.companyName}</Text>
        <TextField label={t('Username')} value={username} onChange={setUsername} autoCapitalize="none" />
        <TextField label={t('Password')} value={password} onChange={setPassword} secure autoCapitalize="none" onSubmit={submit} />
        {!!error && <Text style={{ color: colors.danger, marginBottom: space.md }}>{error}</Text>}
        <Button title={t(busy ? 'Signing in…' : 'Sign in')} icon="log-in-outline" onPress={submit} disabled={busy || !username || !password} />
        {bioUser && <Button title={t('Unlock with Face ID / fingerprint')} icon="finger-print-outline" variant="secondary" onPress={biometric} style={{ marginTop: space.sm }} />}
      </Card>
      {demo && <Text style={{ textAlign: 'center', color: colors.muted }}>{t('Demo login: admin / demo1234')}</Text>}
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>{t('Forgot your password? Ask your administrator to reset it.')}</Text>
    </Shell>
  );
}

/** For books created before user accounts existed: create the first administrator. */
export function CreateAdminScreen() {
  const { runWith, startSession, state } = useStore();
  const { t } = useT();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const submit = () => {
    if (password !== confirm) return notify(t('Passwords do not match'), t('Type the same password twice.'));
    const id = runWith((s) => {
      const r = addUser(s, { username, name, role: 'admin', password }, randomBytes);
      return { state: r.state, value: r.user.id };
    });
    if (id) startSession(id);
  };
  return (
    <Shell>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: space.sm }}>{t('Create the administrator account')}</Text>
        <Text style={{ color: colors.muted, marginBottom: space.md }}>{t('{company} needs an administrator. This account manages users and settings.', { company: state?.settings.companyName ?? '' })}</Text>
        <TextField label={t('Your Name')} value={name} onChange={setName} required />
        <TextField label={t('Username')} value={username} onChange={setUsername} required autoCapitalize="none" />
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <Button title={t('Create Account')} icon="checkmark" onPress={submit} />
      </Card>
    </Shell>
  );
}

/** Shown after an administrator reset the password, and from the account screen. */
export function ChangePasswordForm({ onDone, forced }: { onDone?: () => void; forced?: boolean }) {
  const { run, user, logout } = useStore();
  const { t } = useT();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  if (!user) return null;
  const submit = () => {
    if (password !== confirm) return notify(t('Passwords do not match'), t('Type the same password twice.'));
    try {
      if (run((s) => changePassword(s, user.id, current, password, randomBytes), { allowReadOnly: true })) {
        notify(t('Password changed'), t('Use your new password next time you sign in.'));
        setCurrent('');
        setPassword('');
        setConfirm('');
        onDone?.();
      }
    } catch (e) {
      if (e instanceof AccountingError) notify(t('Validation Error'), t(e.message));
    }
  };
  return (
    <Card>
      <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: space.sm }}>{t('Change Password')}</Text>
      {forced && <Text style={{ color: colors.warning, marginBottom: space.md }}>{t('Your password was reset. Choose a new password to continue.')}</Text>}
      <TextField label={t(forced ? 'Temporary Password' : 'Current Password')} value={current} onChange={setCurrent} secure autoCapitalize="none" />
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      <Button title={t('Change Password')} icon="key-outline" onPress={submit} />
      {forced && <Button title={t('Sign out')} variant="ghost" onPress={logout} style={{ marginTop: space.sm }} />}
    </Card>
  );
}

export function ForcePasswordChangeScreen() {
  return (
    <Shell>
      <ChangePasswordForm forced />
    </Shell>
  );
}
