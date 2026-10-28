import { router, Stack } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useBooks, useMoney, useStore } from '../../data/store';
import { depreciationBoard, postAllDepreciations } from '../../domain/assets';
import { today } from '../../domain/utils';
import { Badge, Button, EmptyState, Fab, ListItem } from '../../ui/components';
import { notify } from '../../ui/dialog';
import { colors, space } from '../../ui/theme';

export default function AssetsList() {
  const s = useBooks();
  const { run } = useStore();
  const money = useMoney();
  const runAll = () => {
    if (run((st) => postAllDepreciations(st, today()))) notify('Depreciation', 'All depreciation entries due until today are posted.');
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Assets' }} />
      <FlatList
        data={s.assets}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          s.assets.some((a) => a.state === 'running') ? (
            <View style={{ padding: space.md }}>
              <Button small variant="secondary" title="Post due depreciation (all assets)" icon="flash-outline" onPress={runAll} />
            </View>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState icon="car-outline" title="No assets" message="Track equipment, vehicles and furniture and depreciate them automatically." />}
        renderItem={({ item: a }) => {
          const board = depreciationBoard(a, s.settings.decimals);
          const done = a.depreciationMoveIds.length;
          const book = done ? a.originalValue - board[done - 1].cumulative : a.originalValue;
          return (
            <ListItem
              title={a.name}
              subtitle={`${done}/${board.length} depreciations · Book value ${money(book)}`}
              right={money(a.originalValue)}
              badge={<Badge label={a.state === 'draft' ? 'Draft' : a.state === 'running' ? 'Running' : 'Closed'} tone={a.state} />}
              onPress={() => router.push({ pathname: '/assets/[id]', params: { id: a.id } })}
            />
          );
        }}
      />
      <Fab onPress={() => router.push({ pathname: '/assets/[id]', params: { id: 'new' } })} />
    </View>
  );
}
