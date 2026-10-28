import { router, Stack } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useBooks, useStore } from '../../data/store';
import { isAdmin, ROLE_LABELS } from '../../domain/auth';
import { useT } from '../../i18n';
import { Badge, EmptyState, Fab, ListItem } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function UsersList() {
  const s = useBooks();
  const { user } = useStore();
  const { t, fmtDate } = useT();
  if (!isAdmin(user?.role)) return <EmptyState icon="lock-closed-outline" title={t('Administrators only')} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Users & Access') }} />
      <FlatList
        data={[...s.users].sort((a, b) => a.username.localeCompare(b.username))}
        keyExtractor={(u) => u.id}
        renderItem={({ item: u }) => (
          <ListItem
            title={`${u.name} (${u.username})`}
            subtitle={`${t(ROLE_LABELS[u.role])}${u.lastLoginAt ? ` · ${t('Last sign-in')} ${fmtDate(u.lastLoginAt.slice(0, 10))}` : ''}`}
            badge={!u.active ? <Badge label={t('Deactivated')} tone="cancel" /> : u.mustChangePassword ? <Badge label={t('Temporary password')} tone="pending" /> : undefined}
            onPress={() => router.push({ pathname: '/users/[id]', params: { id: u.id } })}
          />
        )}
      />
      <Fab onPress={() => router.push({ pathname: '/users/[id]', params: { id: 'new' } })} />
    </View>
  );
}
