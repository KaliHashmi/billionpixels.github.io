import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import { useBooks, useLookups, useMoney } from '../data/store';
import { useT } from '../i18n';
import { KIND_LABELS, ScanButtons, useScanActions } from '../features/ScanDocument';
import { ScanItem, scanSession, useScanItems } from '../features/scanSession';
import { Badge, Button, EmptyState, ListItem } from '../ui/components';
import { colors, space } from '../ui/theme';

/** The documents scanned or uploaded in this session: reading progress, then one row each to check and confirm. */
export default function ScanReviewList() {
  const s = useBooks();
  const lk = useLookups();
  const money = useMoney();
  const { t, fmtDate } = useT();
  const items = useScanItems();
  const { open } = useScanActions();
  const opened = useRef(false);

  // A single document opens by itself as soon as it has been read.
  useEffect(() => {
    if (!opened.current && items.length === 1 && items[0].status === 'ready') {
      opened.current = true;
      open(items[0], true);
    }
  }, [items, open]);

  // Badge tones reuse the document status colours.
  const status = (i: ScanItem): { label: string; tone: string } => {
    if (i.status === 'queued') return { label: 'Waiting', tone: 'draft' };
    if (i.status === 'reading') return { label: i.step === 'recognising' ? 'Recognising…' : 'Reading…', tone: 'partial' };
    if (i.status === 'failed') return { label: 'Could not read', tone: 'overdue' };
    if (i.kind === 'expense') return i.targetId ? { label: 'Saved', tone: 'paid' } : { label: 'To check', tone: 'pending' };
    const move = s.moves.find((m) => m.id === i.targetId);
    if (!move) return { label: 'Removed', tone: 'draft' };
    return move.state === 'posted' ? { label: 'Confirmed', tone: 'paid' } : { label: 'To check', tone: 'pending' };
  };

  const title = (i: ScanItem) => {
    const r = i.reading;
    return (r?.vendorId && lk.partners.get(r.vendorId)?.name) || r?.vendorGuess || t('Document {n}', { n: i.n });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('Scanned Documents') }} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: space.md, gap: space.sm, paddingBottom: 60 }}
        ListHeaderComponent={<ScanButtons />}
        ListEmptyComponent={<EmptyState title={t('Nothing scanned yet')} message={t('Photograph a bill or receipt, or upload PDFs. Hisab reads them on this phone and fills them in for you to check.')} />}
        renderItem={({ item }) => {
          const st = status(item);
          return (
            <ListItem
              title={title(item)}
              subtitle={[item.kind ? t(KIND_LABELS[item.kind]) : '', item.reading?.reference ?? '', item.reading?.date ? fmtDate(item.reading.date) : '', item.error ? t(item.error) : ''].filter(Boolean).join(' · ')}
              right={item.reading?.total !== undefined ? money(item.reading.total) : undefined}
              badge={<Badge label={t(st.label)} tone={st.tone} />}
              onPress={item.status === 'ready' ? () => open(item) : undefined}
            />
          );
        }}
        ListFooterComponent={items.length > 0 ? <Button small variant="ghost" title={t('Clear list')} icon="close-circle-outline" onPress={() => scanSession.clear()} /> : undefined}
      />
    </View>
  );
}
