import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function VendorLayout() {
  const { signOut } = useAuthStore();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#FF6B6B', headerTintColor: '#FF6B6B' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          headerRight: () => (
            <Text 
              onPress={() => { import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); signOut(); }} 
              style={{ marginRight: 16, color: '#FF6B6B', fontWeight: 'bold' }}
            >
              Logout
            </Text>
          )
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Daily Menu',
          tabBarLabel: 'Menu',
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Meal Plans',
          tabBarLabel: 'Plans',
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
          tabBarLabel: 'Ledger',
        }}
      />
    </Tabs>
  );
}
