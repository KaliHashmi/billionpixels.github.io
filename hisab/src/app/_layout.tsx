import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../data/store';
import { CreateAdminScreen, ForcePasswordChangeScreen, LoginScreen } from '../features/Auth';
import Onboarding from '../features/Onboarding';
import { I18nProvider } from '../i18n';
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
        </StoreProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, state, user } = useStore();
  if (!ready) return <Loading />;
  if (!state) return <Onboarding />;
  if (!state.users.length) return <CreateAdminScreen />;
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ForcePasswordChangeScreen />;
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
