import { Tabs } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function VendorLayout() {
  const { signOut } = useAuthStore();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'orange' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
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
