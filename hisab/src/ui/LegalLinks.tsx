import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ENV } from '../config/env';
import { useT } from '../i18n';
import { colors, space } from './theme';

// In a browser, open a new tab so the app (and any unsaved form) stays open.
export const openLink = (url: string) => (Platform.OS === 'web' ? void window.open(url, '_blank', 'noopener') : Linking.openURL(url).catch(() => undefined));

/**
 * Terms, privacy policy and support links. Both stores require the privacy policy to be reachable inside the app,
 * including before sign-in, so this sits on the welcome, sign-in and account screens.
 */
export function LegalLinks() {
  const { t } = useT();
  const links: [string, string][] = [
    [t('Terms of Use'), ENV.links.terms],
    [t('Privacy Policy'), ENV.links.privacy],
    [t('Support'), ENV.links.support],
  ];
  return (
    <View style={st.row}>
      {links.map(([label, url], i) => (
        <View key={url} style={st.item}>
          {i > 0 && <Text style={st.dot}>·</Text>}
          <Pressable role="link" onPress={() => openLink(url)} hitSlop={8}>
            <Text style={st.link}>{label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function spaceToggles(e: KeyboardEvent, toggle: () => void) {
  if (e.key !== ' ') return;
  e.preventDefault();
  toggle();
}

/** "I agree" checkbox for the Terms of Use and Privacy Policy, with both linked. */
export function TermsConsent({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useT();
  const label = t('I have read and agree to the Terms of Use and the Privacy Policy.');
  return (
    <View style={st.consent}>
      <Pressable
        role="checkbox"
        aria-checked={value}
        aria-label={label}
        onPress={() => onChange(!value)}
        hitSlop={8}
        style={st.consentRow}
        testID="terms-consent"
        // Browsers: a checkbox toggles with the space bar (react-native-web only maps Enter to a press).
        onKeyDown={Platform.OS === 'web' ? (e) => spaceToggles(e as unknown as KeyboardEvent, () => onChange(!value)) : undefined}
      >
        <Ionicons name={value ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
        <Text style={st.consentText}>{label}</Text>
      </Pressable>
      <View style={[st.row, { marginVertical: 0 }]}>
        <Pressable role="link" onPress={() => openLink(ENV.links.terms)} hitSlop={8}>
          <Text style={st.link}>{t('Terms of Use')}</Text>
        </Pressable>
        <Text style={st.dot}>·</Text>
        <Pressable role="link" onPress={() => openLink(ENV.links.privacy)} hitSlop={8}>
          <Text style={st.link}>{t('Privacy Policy')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, marginVertical: space.md, flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },
  dot: { color: colors.muted },
  consent: { gap: space.sm, marginVertical: space.md },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  consentText: { flex: 1, color: colors.text, fontSize: 14 },
});
