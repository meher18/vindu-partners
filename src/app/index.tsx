import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  // The layout handles routing, this just shows a loader while routing happens
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
