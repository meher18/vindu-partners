import { Tabs } from 'expo-router';

export default function DriverLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'blue' }}>
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

