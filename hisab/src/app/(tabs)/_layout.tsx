import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Image, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ColorValue } from 'react-native';
import { useT } from '../../i18n';
import { colors } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={color as string} />,
});

export default function TabsLayout() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  // Room for the icon plus a full line of text: Arabic letters reach lower than Latin ones and were clipped.
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 8);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarStyle: { height: 58 + bottom, paddingTop: 0, paddingBottom: bottom },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 16 },
        sceneStyle: { backgroundColor: colors.bg },
        headerRight: () => (
          <Pressable accessibilityLabel={t('My Account')} hitSlop={10} onPress={() => router.push('/account')} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="person-circle-outline" size={26} color="#fff" />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{
          ...tab(t('Dashboard'), 'speedometer-outline'),
          headerTitle: () => <Image source={require('../../../assets/header-logo.png')} accessibilityLabel={t('Hisab')} style={{ width: 30, height: 30 }} resizeMode="contain" />,
        }} />
      <Tabs.Screen name="customers" options={tab(t('Customers'), 'people-outline')} />
      <Tabs.Screen name="vendors" options={tab(t('Vendors'), 'cart-outline')} />
      <Tabs.Screen name="accounting" options={tab(t('Accounting'), 'calculator-outline')} />
      <Tabs.Screen name="reports" options={tab(t('Reporting'), 'bar-chart-outline')} />
    </Tabs>
  );
}
