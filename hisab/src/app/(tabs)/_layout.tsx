import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { colors } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={color as string} />,
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ ...tab('Dashboard', 'speedometer-outline'), headerTitle: 'Hisab' }} />
      <Tabs.Screen name="customers" options={tab('Customers', 'people-outline')} />
      <Tabs.Screen name="vendors" options={tab('Vendors', 'cart-outline')} />
      <Tabs.Screen name="accounting" options={tab('Accounting', 'calculator-outline')} />
      <Tabs.Screen name="reports" options={tab('Reporting', 'bar-chart-outline')} />
    </Tabs>
  );
}
