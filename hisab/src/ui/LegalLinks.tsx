import * as Linking from 'expo-linking';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ENV } from '../config/env';
import { useT } from '../i18n';
import { colors, space } from './theme';

/**
 * Privacy policy and support links. Both stores require the privacy policy to be reachable inside the app,
 * including before sign-in, so this sits on the welcome, sign-in and account screens.
 */
export function LegalLinks() {
  const { t } = useT();
  // In a browser, open a new tab so the app (and any unsaved form) stays open.
  const open = (url: string) => (Platform.OS === 'web' ? void window.open(url, '_blank', 'noopener') : Linking.openURL(url).catch(() => undefined));
  return (
    <View style={st.row}>
      <Pressable role="link" onPress={() => open(ENV.links.privacy)} hitSlop={8}>
        <Text style={st.link}>{t('Privacy Policy')}</Text>
      </Pressable>
      <Text style={st.dot}>·</Text>
      <Pressable role="link" onPress={() => open(ENV.links.support)} hitSlop={8}>
        <Text style={st.link}>{t('Support')}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, marginVertical: space.md },
  link: { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },
  dot: { color: colors.muted },
});
