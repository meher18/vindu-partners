import { Tabs } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { Feather } from '@expo/vector-icons';

export default function VendorLayout() {
  const { signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out?', 'You will need to sign in again to manage your kitchen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
          signOut();
        },
      },
    ]);
  };

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#FF6B6B',
      headerTintColor: '#FF6B6B',
      headerRight: () => (
        <Text onPress={handleSignOut} style={{ marginRight: 16, color: '#FF6B6B', fontWeight: 'bold' }}>
          Logout
        </Text>
      ),
      tabBarHideOnKeyboard: true,
      headerShadowVisible: false,
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Daily Menu',
          tabBarLabel: 'Menu',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Meal Plans',
          tabBarLabel: 'Plans',
          tabBarIcon: ({ color, size }) => <Feather name="tag" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dispatch"
        options={{
          title: 'Dispatch',
          tabBarLabel: 'Dispatch',
          tabBarIcon: ({ color, size }) => <Feather name="truck" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
          tabBarLabel: 'Ledger',
          tabBarIcon: ({ color, size }) => <Feather name="dollar-sign" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
