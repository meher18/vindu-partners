import { Tabs } from 'expo-router';

export default function DriverLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#FF6B6B', headerTintColor: '#FF6B6B' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Route',
          tabBarLabel: 'Route',
        }}
      />
    </Tabs>
  );
}

