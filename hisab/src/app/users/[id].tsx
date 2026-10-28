import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { randomBytes, useBooks, useStore } from '../../data/store';
import { addUser, isAdmin, resetPassword, ROLE_LABELS, updateUser } from '../../domain/auth';
import { UserRole } from '../../domain/types';
import { NewPasswordFields } from '../../features/Auth';
import { useT } from '../../i18n';
import { Button, Card, EmptyState, Screen, SectionTitle } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { SelectField, SwitchField, TextField } from '../../ui/fields';
import { colors, space } from '../../ui/theme';

export default function UserForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useBooks();
  const { run, user: me } = useStore();
  const { t } = useT();
  const existing = s.users.find((u) => u.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [role, setRole] = useState<UserRole>(existing?.role ?? 'accountant');
  const [active, setActive] = useState(existing?.active ?? true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  if (!isAdmin(me?.role)) return <EmptyState icon="lock-closed-outline" title={t('Administrators only')} />;

  const roleOptions = (Object.keys(ROLE_LABELS) as UserRole[]).map((r) => ({ value: r, label: t(ROLE_LABELS[r]) }));

  const save = () => {
    if (!existing && password !== confirm) return notify(t('Passwords do not match'), t('Type the same password twice.'));
    const ok = existing
      ? run((x) => updateUser(x, existing.id, { name, role, active }))
      : run((x) => addUser(x, { username, name, role, password, mustChangePassword: true }, randomBytes).state);
    if (ok) router.back();
  };

  const reset = () => {
    if (!existing) return;
    if (password !== confirm) return notify(t('Passwords do not match'), t('Type the same password twice.'));
    if (run((x) => resetPassword(x, existing.id, password, randomBytes))) {
      setPassword('');
      setConfirm('');
      notify(t('Password reset'), t('Give the temporary password to {name}. They must change it at the next sign-in.', { name: existing.name }));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? existing.name : t('New User') }} />
      <Card>
        <TextField label={t('Full Name')} value={name} onChange={setName} required />
        <TextField label={t('Username')} value={username} onChange={setUsername} required autoCapitalize="none" editable={!existing} />
        <SelectField label={t('Role')} value={role} allowClear={false} options={roleOptions} onChange={(v) => v && setRole(v as UserRole)} />
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: space.md }}>
          {t('Administrators manage users and settings. Accountants record transactions. Viewers can only see the books and reports.')}
        </Text>
        {existing && existing.id !== me?.id && <SwitchField label={t('Active')} value={active} onChange={setActive} />}
        {!existing && <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />}
        {!existing && <Text style={{ color: colors.muted, fontSize: 12, marginBottom: space.md }}>{t('This is a temporary password; the user chooses their own at the first sign-in.')}</Text>}
        <Button title={t('Save')} icon="checkmark" onPress={save} />
      </Card>
      {existing && existing.id !== me?.id && (
        <Card>
          <SectionTitle>{t('Reset Password')}</SectionTitle>
          <Text style={{ height: space.sm }} />
          <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
          <Button title={t('Set Temporary Password')} variant="secondary" icon="key-outline" onPress={reset} />
        </Card>
      )}
    </Screen>
  );
}
