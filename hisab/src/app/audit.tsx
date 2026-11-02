import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useBooks, useStore } from '../data/store';
import { isAdmin } from '../domain/auth';
import { useT } from '../i18n';
import { Card, EmptyState, Screen } from '../ui/components';
import { colors, space } from '../ui/theme';

/** Read-only trail of cancellations, corrections, edits of issued documents and user deletions. */
export default function AuditScreen() {
  const s = useBooks();
  const { user } = useStore();
  const { t, fmtDate } = useT();
  if (!isAdmin(user?.role)) return <EmptyState icon="lock-closed-outline" title={t('Administrators only')} />;
  const entries = [...(s.auditLog ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Screen>
      <Stack.Screen options={{ title: t('Audit Log') }} />
      <Text style={{ color: colors.muted, marginBottom: space.sm }}>
        {t('Entries cannot be edited or removed. They are included in backups and kept with the books.')}
      </Text>
      {!entries.length && <EmptyState icon="time-outline" title={t('Nothing recorded yet')} />}
      {entries.map((e) => (
        <Card key={e.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{t(e.action)}</Text>
            <Text style={{ color: colors.muted }}>{e.ref}</Text>
          </View>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            {fmtDate(e.at.slice(0, 10))} {e.at.slice(11, 16)} · {e.user}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
