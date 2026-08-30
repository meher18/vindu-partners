import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorLedger() {
  const { user } = useAuthStore();

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['vendor-ledger', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_ledger')
        .select('*')
        .eq('kitchen_id', kitchen?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const availableBalance = ledger?.filter(l => l.status === 'available').reduce((sum, l) => sum + l.amount, 0) || 0;
  const pendingBalance = ledger?.filter(l => l.status === 'pending').reduce((sum, l) => sum + l.amount, 0) || 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings Ledger</Text>
        <Text style={styles.subtitle}>Track your payouts and rolling T+7 settlements</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Balances */}
        <View style={styles.balanceGrid}>
          <View style={[styles.balanceCard, styles.availableCard]}>
            <Text style={styles.balanceLabel}>Available for Payout</Text>
            {isLoading ? <ActivityIndicator color="#027A48" /> : <Text style={styles.balanceAmountAvailable}>₹{availableBalance.toFixed(0)}</Text>}
            <Text style={styles.balanceSub}>Next payout: Tuesday</Text>
          </View>
          <View style={[styles.balanceCard, styles.pendingCard]}>
            <Text style={styles.balanceLabel}>Pending (T+7)</Text>
            {isLoading ? <ActivityIndicator color="#B54708" /> : <Text style={styles.balanceAmountPending}>₹{pendingBalance.toFixed(0)}</Text>}
            <Text style={styles.balanceSub}>Clearing this week</Text>
          </View>
        </View>

        {/* Payout Settings */}
        <View style={styles.payoutCard}>
          <Text style={styles.payoutTitle}>Payout Settings</Text>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>UPI ID:</Text>
            <Text style={styles.payoutValue}>{kitchen?.upi_id || 'Not Set (Tap to add)'}</Text>
          </View>
        </View>

        {/* Transaction History */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        {isLoading && <ActivityIndicator size="large" color="#FF6B6B" style={{ marginTop: 40 }} />}

        {!isLoading && ledger?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyTitle}>No earnings yet</Text>
            <Text style={styles.emptySub}>Your earnings will appear here once you start delivering meals.</Text>
          </View>
        )}

        {ledger?.map((tx: any) => {
          const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isPending = tx.status === 'pending';
          const isPaid = tx.status === 'paid';
          return (
            <View key={tx.id} style={styles.txRow}>
              <View style={[styles.txIconWrap, isPaid ? styles.iconPaid : isPending ? styles.iconPending : styles.iconAvailable]}>
                <Text style={styles.txIcon}>{isPaid ? '✓' : isPending ? '⏳' : '💰'}</Text>
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txDesc}>{tx.description}</Text>
                <Text style={styles.txDate}>{date} · {tx.status.toUpperCase()}</Text>
              </View>
              <Text style={[styles.txAmount, tx.amount < 0 && styles.txNegative]}>
                {tx.amount > 0 ? '+' : ''}₹{Math.abs(tx.amount).toFixed(0)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  scroll: { padding: 24 },
  balanceGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  balanceCard: { flex: 1, padding: 20, borderRadius: 20, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  availableCard: { backgroundColor: '#ECFDF3', borderWidth: 1, borderColor: '#D1FADF' },
  pendingCard: { backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEF0C7' },
  balanceLabel: { fontSize: 13, fontWeight: '600', color: '#667085', marginBottom: 8 },
  balanceAmountAvailable: { fontSize: 28, fontWeight: '900', color: '#027A48', marginBottom: 4 },
  balanceAmountPending: { fontSize: 28, fontWeight: '900', color: '#B54708', marginBottom: 4 },
  balanceSub: { fontSize: 12, color: '#667085' },
  payoutCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#EAECF0' },
  payoutTitle: { fontSize: 14, fontWeight: '700', color: '#101828', marginBottom: 8 },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payoutLabel: { fontSize: 13, color: '#667085' },
  payoutValue: { fontSize: 13, fontWeight: '600', color: '#FF6B6B' },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#101828' },
  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#FFF', borderRadius: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#667085', textAlign: 'center', lineHeight: 20 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 10, shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  txIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  iconPaid: { backgroundColor: '#F2F4F7' },
  iconPending: { backgroundColor: '#FEF0C7' },
  iconAvailable: { backgroundColor: '#D1FADF' },
  txIcon: { fontSize: 18 },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 15, fontWeight: '700', color: '#101828', marginBottom: 4 },
  txDate: { fontSize: 12, color: '#667085', fontWeight: '500' },
  txAmount: { fontSize: 16, fontWeight: '800', color: '#027A48' },
  txNegative: { color: '#DC2626' },
});
