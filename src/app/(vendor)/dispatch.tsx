import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import * as Haptics from 'expo-haptics';

export default function DispatchScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  
  packingListBtn: { marginTop: 12, paddingVertical: 14, backgroundColor: '#F3F4F6', borderRadius: 12, alignItems: 'center' },
  packingListBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FFF' },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A2E' },
  modalSub: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  closeBtn: { fontSize: 16, fontWeight: '600', color: '#FF6B6B' },
  manifestRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  manifestLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dietBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  dietBadgeText: { fontSize: 12, fontWeight: '800' },
  manifestQty: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  manifestStatusWrap: { backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  manifestStatusLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280' }
});

  const { data: dispatchBatches, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['vendor-dispatch', kitchen?.id],
    queryFn: async () => {
      // 1. Get all active subscriptions for this kitchen
      const { data: subs } = await supabase.from('subscriptions').select('id, slot_name, diet_type').eq('kitchen_id', kitchen?.id);
      if (!subs || subs.length === 0) return [];

      // 2. Get all active customer subscriptions attached to these plans
      const { data: cSubs } = await supabase.from('customer_subscriptions').select('id, subscription_id, quantity').in('subscription_id', subs.map(s => s.id)).eq('status', 'active');
      if (!cSubs || cSubs.length === 0) return [];

      // 3. Get today's deliveries for these customer subscriptions
      const today = new Date().toISOString().split('T')[0]; // Adjust for timezone in prod
      const { data: deliveries } = await supabase.from('deliveries').select('id, customer_subscription_id, status, vendor_ready_at').in('customer_subscription_id', cSubs.map(cs => cs.id)).eq('date', today);
      if (!deliveries) return [];

      // Group by slot
      const batches: Record<string, { slot: string, totalQty: number, readyCount: number, pickedUpCount: number, deliveryIds: string[], dietBreakdown: Record<string, number> }> = {};

      deliveries.forEach(del => {
        const cSub = cSubs.find(cs => cs.id === del.customer_subscription_id);
        if (!cSub) return;
        const plan = subs.find(s => s.id === cSub.subscription_id);
        if (!plan) return;

        const slot = plan.slot_name.toUpperCase();
        if (!batches[slot]) batches[slot] = { slot, totalQty: 0, readyCount: 0, pickedUpCount: 0, deliveryIds: [], dietBreakdown: {}, rawDeliveries: [] };
        
        const qty = cSub.quantity || 1;
        batches[slot].totalQty += qty;
        batches[slot].deliveryIds.push(del.id);
        batches[slot].rawDeliveries.push({
          id: del.id,
          diet: plan.diet_type.toUpperCase(),
          qty,
          status: del.status,
          customer_id: cSub.customer_id
        });
        
        if (del.vendor_ready_at) batches[slot].readyCount += qty;
        if (del.status === 'picked_up' || del.status === 'delivered') batches[slot].pickedUpCount += qty;

        const diet = plan.diet_type.toUpperCase();
        batches[slot].dietBreakdown[diet] = (batches[slot].dietBreakdown[diet] || 0) + qty;
      });

      return Object.values(batches);
    },
    enabled: !!kitchen?.id,
  });

  const markBatchReady = useMutation({
    mutationFn: async (deliveryIds: string[]) => {
      const { error } = await supabase.from('deliveries').update({ vendor_ready_at: new Date().toISOString(), status: 'vendor_ready' }).in('id', deliveryIds).is('vendor_ready_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['vendor-dispatch', kitchen?.id] });
      Alert.alert('Batch Ready', 'The driver will be notified to pick up the orders.');
    },
    onError: (err: any) => Alert.alert('Error', err.message)
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Dispatch Hub</Text>
        <Text style={styles.subtitle}>Manage handoffs to delivery drivers</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FF6B6B" />}>
        {isLoading ? <ActivityIndicator size="large" color="#FF6B6B" style={{ marginTop: 40 }} /> : null}

        {!isLoading && dispatchBatches?.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🛵</Text>
            <Text style={styles.emptyTitle}>No Deliveries Today</Text>
            <Text style={styles.emptySub}>Take a break! There are no orders scheduled for dispatch today.</Text>
          </View>
        )}

        {dispatchBatches?.map(batch => {
          const isFullyReady = batch.readyCount >= batch.totalQty;
          const isFullyPickedUp = batch.pickedUpCount >= batch.totalQty;
          
          return (
            <View key={batch.slot} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.slotName}>{batch.slot} BATCH</Text>
                  <Text style={styles.qtyText}>{batch.totalQty} Total Meals</Text>
                </View>
                {isFullyPickedUp ? (
                  <View style={[styles.readyBadge, { backgroundColor: '#EFF6FF' }]}><Text style={[styles.readyBadgeText, { color: '#1D4ED8' }]}>✅ DISPATCHED</Text></View>
                ) : isFullyReady ? (
                  <View style={styles.readyBadge}><Text style={styles.readyBadgeText}>📦 STAGED FOR PICKUP</Text></View>
                ) : (
                  <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>🔥 COOKING</Text></View>
                )}
              </View>

              <View style={styles.breakdown}>
                {Object.entries(batch.dietBreakdown).map(([diet, qty]) => (
                  <View key={diet} style={styles.dietRow}>
                    <Text style={styles.dietName}>{diet}</Text>
                    <Text style={styles.dietQty}>{qty} boxes</Text>
                  </View>
                ))}
              </View>

              {!isFullyReady && (
                <View style={{ gap: 12 }}>
                  <TouchableOpacity 
                    style={[styles.dispatchBtn, markBatchReady.isPending && { opacity: 0.7 }]} 
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Alert.alert('Ready for Pickup?', `Are you sure all ${batch.totalQty} boxes for ${batch.slot} are packed and staged for driver pickup?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm Ready', onPress: () => markBatchReady.mutate(batch.deliveryIds) }
                      ]);
                    }}
                    disabled={markBatchReady.isPending}
                  >
                    {markBatchReady.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.dispatchBtnText}>Mark Ready for Dispatch →</Text>}
                  </TouchableOpacity>
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.packingListBtn}
                onPress={() => setActiveBatch(batch)}
              >
                <Text style={styles.packingListBtnText}>📋 View Packing Manifest</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* PACKING MANIFEST MODAL */}
      <Modal visible={!!activeBatch} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveBatch(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{activeBatch?.slot} Manifest</Text>
              <Text style={styles.modalSub}>{activeBatch?.totalQty} Total Boxes to Pack</Text>
            </View>
            <TouchableOpacity onPress={() => setActiveBatch(null)}>
              <Text style={styles.closeBtn}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            {activeBatch?.rawDeliveries.map((del: any, idx: number) => (
              <View key={del.id} style={styles.manifestRow}>
                <View style={styles.manifestLeft}>
                  <View style={[styles.dietBadge, del.diet === 'VEG' ? { backgroundColor: '#ECFDF5' } : { backgroundColor: '#FEF2F2' }]}>
                    <Text style={[styles.dietBadgeText, del.diet === 'VEG' ? { color: '#059669' } : { color: '#DC2626' }]}>{del.diet}</Text>
                  </View>
                  <Text style={styles.manifestQty}>{del.qty}x Boxes</Text>
                </View>
                <View style={styles.manifestStatusWrap}>
                  <Text style={styles.manifestStatusLabel}>{del.status.replace('_', ' ').toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { padding: 24, paddingTop: 12, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A2E' },
  subtitle: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  scroll: { padding: 20 },
  card: { backgroundColor: '#F9FAFB', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  slotName: { fontSize: 18, fontWeight: '800', color: '#1A1A2E' },
  qtyText: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  readyBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  readyBadgeText: { color: '#059669', fontSize: 11, fontWeight: '800' },
  pendingBadge: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  pendingBadgeText: { color: '#DC2626', fontSize: 11, fontWeight: '800' },
  breakdown: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16 },
  dietRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dietName: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dietQty: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  dispatchBtn: { backgroundColor: '#FF6B6B', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  dispatchBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#6B7280', textAlign: 'center', paddingHorizontal: 20 },
});

