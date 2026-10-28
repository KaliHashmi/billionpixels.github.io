import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks } from '../../../data/store';
import { ENTITIES } from '../../../features/entities';
import { Badge, Chips, EmptyState, Fab, ListItem, SearchBar } from '../../../ui/components';
import { colors, space } from '../../../ui/theme';

export default function EntityList() {
  const params = useLocalSearchParams<{ entity: string; kind?: string }>();
  const def = ENTITIES[params.entity];
  const s = useBooks();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const records = useMemo(() => {
    if (!def) return [];
    const list = (s[def.collection] as { id: string; active: boolean }[]).filter((r) => !def.listFilter || def.listFilter(r, params));
    return def.sort ? [...list].sort(def.sort) : list;
  }, [s, def, params]);
  if (!def) return null;
  const term = q.trim().toLowerCase();
  const visible = records.filter(
    (r) => (show === 'active' ? r.active : !r.active) && (!term || def.display(r).toLowerCase().includes(term) || def.subtitle?.(r, s).toLowerCase().includes(term)),
  );
  const title = params.entity === 'partners' ? (params.kind === 'customer' ? 'Customers' : params.kind === 'supplier' ? 'Vendors' : 'Contacts') : def.title;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title }} />
      <View style={{ padding: space.md, gap: space.sm }}>
        <SearchBar value={q} onChangeText={setQ} />
        <Chips
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Active', count: records.filter((r) => r.active).length },
            { value: 'archived', label: 'Archived', count: records.filter((r) => !r.active).length },
          ]}
        />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon={def.icon} title={`No ${title.toLowerCase()}`} message="Tap + to create one." />}
        renderItem={({ item }) => (
          <ListItem
            title={def.display(item)}
            subtitle={def.subtitle?.(item, s)}
            badge={!item.active ? <Badge label="Archived" tone="draft" /> : undefined}
            onPress={() => router.push({ pathname: '/config/[entity]/[id]', params: { entity: params.entity, id: item.id } })}
          />
        )}
      />
      <Fab onPress={() => router.push({ pathname: '/config/[entity]/[id]', params: { entity: params.entity, id: 'new', kind: params.kind } })} />
    </View>
  );
}
