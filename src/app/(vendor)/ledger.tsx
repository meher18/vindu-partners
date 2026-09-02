import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorLedger() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [upiModal, setUpiModal] = useState(false);
  const [upiInput, setUpiInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ['vendor-ledger'] });
    setRefreshing(false);
  }, [queryClient]);

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id, upi_id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  React.useEffect(() => {
    if (kitchen?.upi_id && !upiInput) {
      setUpiInput(kitchen.upi_id);
    }
  }, [kitchen?.upi_id]);

  const { data: mrr } = useQuery({
    queryKey: ['vendor-mrr', kitchen?.id],
    queryFn: async () => {
      const { data: subs } = await supabase.from('subscriptions').select('id, vendor_fee').eq('kitchen_id', kitchen?.id);
      if (!subs || subs.length === 0) return 0;
      
      const { data: cSubs } = await supabase
        .from('customer_subscriptions')
        .select('subscription_id, quantity')
        .eq('status', 'active')
        .in('subscription_id', subs.map(s => s.id));
        
      if (!cSubs) return 0;
      
      let totalDaily = 0;
      cSubs.forEach((cs) => {
        const sub = subs.find(s => s.id === cs.subscription_id);
        totalDaily += (cs.quantity || 1) * (sub?.vendor_fee || 0);
      });
      
      return totalDaily * 30;
    },
    enabled: !!kitchen?.id,
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['vendor-ledger', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_ledger').select('*').eq('kitchen_id', kitchen?.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const updateUpi = useMutation({
    mutationFn: async () => {
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiRegex.test(upiInput)) throw new Error("Please enter a valid UPI ID (e.g. name@bank).");
      const { error } = await supabase.from('kitchens').update({ upi_id: upiInput }).eq('id', kitchen?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setUpiModal(false);
      queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] });
    },
    onError: (err: any) => Alert.alert('Invalid', err.message)
  });

  const pendingBalance = ledger?.filter(l => l.status === 'pending').reduce((sum, l) => sum + Number(l.net_amount || 0), 0) || 0;
  const lifetimeEarnings = ledger?.reduce((sum, l) => sum + Number(l.net_amount || 0), 0) || 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings Ledger</Text>
        <Text style={styles.subtitle}>Track your payouts and rolling T+7 settlements</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B6B" />}
      >
        <View style={[styles.balanceCard, { backgroundColor: '#101828', marginBottom: 16, borderWidth: 0, paddingVertical: 24, alignItems: 'center' }]}>
          <Text style={{ color: '#98A2B3', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Projected MRR</Text>
          <Text style={{ color: '#FFF', fontSize: 42, fontWeight: '900', marginTop: 8 }}>₹{(mrr || 0).toLocaleString('en-IN')}</Text>
          <Text style={{ color: '#667085', fontSize: 12, marginTop: 4 }}>Monthly Recurring Revenue based on active subscriptions</Text>
        </View>

        <View style={styles.balanceGrid}>
          <View style={[styles.balanceCard, styles.availableCard]}>
            <Text style={styles.balanceLabel}>Unpaid Balance</Text>
            <Text style={styles.balanceAmountAvailable}>₹{pendingBalance.toFixed(0)}</Text>
            <Text style={styles.balanceSub}>Next payout scheduled</Text>
          </View>
          <View style={[styles.balanceCard, styles.pendingCard]}>
            <Text style={styles.balanceLabel}>Lifetime Earnings</Text>
            <Text style={styles.balanceAmountPending}>₹{lifetimeEarnings.toFixed(0)}</Text>
            <Text style={styles.balanceSub}>Total revenue generated</Text>
          </View>
        </View>

        {/* Payout Settings */}
        <TouchableOpacity style={styles.payoutCard} onPress={() => setUpiModal(true)}>
          <Text style={styles.payoutTitle}>Payout Settings</Text>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>UPI ID:</Text>
            <Text style={styles.payoutValue}>{kitchen?.upi_id || 'Not Set (Tap to add)'}</Text>
          </View>
        </TouchableOpacity>

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
          const val = Number(tx.net_amount || 0);
          return (
            <View key={tx.id} style={styles.txRow}>
              <View style={[styles.txIconWrap, isPaid ? styles.iconPaid : isPending ? styles.iconPending : styles.iconAvailable]}>
                <Text style={styles.txIcon}>{isPaid ? '✓' : isPending ? '⏳' : '💰'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.txDesc}>Delivery Payout</Text>
                  <Text style={[styles.txAmount, val < 0 && styles.txNegative]}>
                    {val > 0 ? '+' : ''}₹{Math.abs(val).toFixed(0)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.txDate}>{date} · {tx.status.toUpperCase()}</Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>Gross: ₹{tx.gross_amount} · Fee: -₹{tx.platform_fee}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* UPI Update Modal */}
      <Modal visible={upiModal} animationType="slide" presentationStyle="formSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#FFF', padding: 24, paddingTop: 40 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 8 }}>Update Payout Settings</Text>
          <Text style={{ color: '#667085', marginBottom: 24 }}>Enter your UPI ID where you want to receive your T+7 settlements.</Text>
          
          <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#344054' }}>UPI ID</Text>
          <TextInput 
            style={{ backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, padding: 16, fontSize: 16 }} 
            value={upiInput} 
            onChangeText={setUpiInput} 
            placeholder="e.g. annapurnatiffins@okhdfcbank" 
            autoCapitalize="none"
          />

          <TouchableOpacity 
            style={{ backgroundColor: '#027A48', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 }} 
            onPress={() => updateUpi.mutate()} 
            disabled={updateUpi.isPending}
          >
            {updateUpi.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Save UPI ID</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setUpiModal(false)}>
            <Text style={{ color: '#667085', fontWeight: '700', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
