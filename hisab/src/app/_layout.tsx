import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../data/store';
import { CreateAdminScreen, ForcePasswordChangeScreen, LoginScreen, TermsGateScreen } from '../features/Auth';
import { needsTermsAcceptance } from '../domain/legal';
import Onboarding from '../features/Onboarding';
import { I18nProvider, useT } from '../i18n';
import { DialogHost } from '../ui/dialog';
import { Loading } from '../ui/components';
import { EnvBadge } from '../ui/EnvBadge';
import { colors } from '../ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StoreProvider>
          <StatusBar style="light" />
          <Gate />
          <EnvBadge />
          <Dialogs />
        </StoreProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Dialogs() {
  const { t } = useT();
  return <DialogHost cancelLabel={t('Cancel')} okLabel={t('OK')} />;
}

function Gate() {
  const { ready, state, user } = useStore();
  if (!ready) return <Loading />;
  if (!state) return <Onboarding />;
  if (!state.users.length) return <CreateAdminScreen />;
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ForcePasswordChangeScreen />;
  // Only an administrator can accept the terms for the company; other users carry on.
  if (user.role === 'admin' && needsTermsAcceptance(state)) return <TermsGateScreen />;
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
