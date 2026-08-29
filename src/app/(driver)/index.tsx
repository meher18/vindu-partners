import { View, Text, StyleSheet, Button } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

export default function DriverHome() {
  const { user } = useAuthStore();

  const handleSignOut = () => {
    supabase.auth.signOut();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Milk Run - Assigned Route</Text>
      <Text style={styles.subtitle}>Driver: {user?.email}</Text>
      
      <View style={styles.content}>
        <Text>Sequential hub-and-spoke delivery stops mapped via Google Routes API will appear here.</Text>
        <View style={styles.stopCard}>
          <Text style={styles.stopText}>Stop 1: 123 Main St</Text>
          <Button title="Mark Delivered & Upload Photo" onPress={() => {}} />
        </View>
      </View>

      <Button title="Sign Out" onPress={handleSignOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  content: { flex: 1, alignItems: 'stretch' },
  stopCard: { padding: 20, backgroundColor: '#e3f2fd', borderRadius: 8, marginTop: 20 },
  stopText: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 }
});

