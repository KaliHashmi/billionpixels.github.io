import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, space } from './theme';

interface Pending {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  cancellable: boolean;
  resolve: (ok: boolean) => void;
}

// Web has no reliable native dialogs (embedded pages block alert/confirm), so dialogs render in-app.
let queue: Pending[] = [];
let listener: ((p: Pending | undefined) => void) | null = null;
const show = () => listener?.(queue[0]);
let labels = { cancel: 'Cancel', ok: 'OK' };

function enqueue(p: Omit<Pending, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...p, resolve });
    if (queue.length === 1) show();
  });
}

export function notify(title: string, message?: string): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, [{ text: labels.ok }]);
    return;
  }
  void enqueue({ title, message, cancellable: false });
}

export function confirm(title: string, message: string, confirmLabel = 'Confirm', destructive = false): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: labels.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });
  }
  return enqueue({ title, message, confirmLabel, destructive, cancellable: true });
}

/** Renders web dialogs; mount once at the root. */
export function DialogHost({ cancelLabel = 'Cancel', okLabel = 'OK' }: { cancelLabel?: string; okLabel?: string }) {
  const [current, setCurrent] = useState<Pending | undefined>();
  useEffect(() => {
    labels = { cancel: cancelLabel, ok: okLabel };
  }, [cancelLabel, okLabel]);
  useEffect(() => {
    listener = setCurrent;
    return () => {
      listener = null;
    };
  }, []);
  if (Platform.OS !== 'web' || !current) return null;
  const close = (ok: boolean) => {
    queue = queue.slice(1);
    current.resolve(ok);
    show();
    if (!queue.length) setCurrent(undefined);
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => close(false)}>
      <View style={st.backdrop}>
        <View style={st.box} accessibilityRole="alert">
          <Text style={st.title}>{current.title}</Text>
          {!!current.message && <Text style={st.message}>{current.message}</Text>}
          <View style={st.actions}>
            {current.cancellable && (
              <Pressable onPress={() => close(false)} style={st.button}>
                <Text style={st.cancel}>{cancelLabel}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => close(true)} style={[st.button, { backgroundColor: current.destructive ? colors.danger : colors.primary }]}>
              <Text style={st.ok}>{current.confirmLabel ?? okLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  box: { backgroundColor: colors.card, borderRadius: 12, padding: space.xl, width: '100%', maxWidth: 380, gap: space.md },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  message: { fontSize: 15, color: colors.text, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  cancel: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  ok: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
