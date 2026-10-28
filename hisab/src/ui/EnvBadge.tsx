import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ENV } from '../config/env';

/** Corner ribbon so testers always know they are not in production. */
export function EnvBadge() {
  const insets = useSafeAreaInsets();
  if (ENV.isProduction) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 2 }]}>
      <Text style={[styles.text, { backgroundColor: ENV.bannerColor }]}>{ENV.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  text: { color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, overflow: 'hidden', letterSpacing: 1 },
});
