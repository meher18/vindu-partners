import { View, Text, StyleSheet } from 'react-native';

export default function VendorLedger() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payout Ledger (T+7)</Text>
      <Text style={styles.subtitle}>View your completed deliveries and rolling settlements.</Text>
      
      <View style={styles.content}>
        <Text>Transaction history and Stripe Connect payout status will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

