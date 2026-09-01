import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert, SafeAreaView, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import * as Haptics from 'expo-haptics';

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

type DietType = 'veg' | 'non-veg' | 'vegan';
type SlotType = 'breakfast' | 'lunch' | 'dinner';

const DIET_OPTIONS: { label: string; value: DietType; emoji: string; color: string; bg: string }[] = [
  { label: 'Veg', value: 'veg', emoji: '🥦', color: '#16A34A', bg: '#F0FDF4' },
  { label: 'Non-Veg', value: 'non-veg', emoji: '🍗', color: '#DC2626', bg: '#FEF2F2' },
  { label: 'Vegan', value: 'vegan', emoji: '🌱', color: '#059669', bg: '#ECFDF5' },
];


const TIME_OPTIONS: Record<SlotType, { label: string, value: string }[]> = {
  breakfast: [
    { label: '8:00 AM', value: '08:00:00' },
    { label: '8:30 AM', value: '08:30:00' },
    { label: '9:00 AM', value: '09:00:00' },
    { label: '9:30 AM', value: '09:30:00' }
  ],
  lunch: [
    { label: '12:00 PM', value: '12:00:00' },
    { label: '12:30 PM', value: '12:30:00' },
    { label: '1:00 PM', value: '13:00:00' },
    { label: '1:30 PM', value: '13:30:00' }
  ],
  dinner: [
    { label: '7:30 PM', value: '19:30:00' },
    { label: '8:00 PM', value: '20:00:00' },
    { label: '8:30 PM', value: '20:30:00' },
    { label: '9:00 PM', value: '21:00:00' }
  ]
};

const SLOT_OPTIONS: { label: string; value: SlotType; emoji: string; defaultTime: string }[] = [
  { label: 'Breakfast', value: 'breakfast', emoji: '☀️', defaultTime: '09:00:00' },
  { label: 'Lunch', value: 'lunch', emoji: '🌤️', defaultTime: '13:00:00' },
  { label: 'Dinner', value: 'dinner', emoji: '🌙', defaultTime: '20:00:00' },
];

const PRICE_OPTIONS = [80, 100, 120, 150, 180, 200];

export default function VendorPlans() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [dietType, setDietType] = useState<DietType>('veg');
  const [slotName, setSlotName] = useState<SlotType>('lunch');
  const [slotTargetTime, setSlotTargetTime] = useState<string>('13:00:00');
  const [price, setPrice] = useState(120);
  const [capacity, setCapacity] = useState(50);
  const [opDays, setOpDays] = useState<'7-day' | '5-day'>('7-day');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['vendor-plans', kitchen?.id] }),
      queryClient.refetchQueries({ queryKey: ['vendor-sub-counts', kitchen?.id] })
    ]);
    setRefreshing(false);
  }, [kitchen?.id, queryClient]);

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: plans, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id).neq('status', 'cancelled');
      if (error) throw error;
      return data;
    },
    enabled: !!kitchen?.id,
  });

  // Query to count active subscribers per plan
  const { data: subCounts } = useQuery({
    queryKey: ['vendor-sub-counts', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return {};
      const planIds = plans.map(p => p.id);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('customer_subscriptions')
        .select('subscription_id, quantity')
        .in('subscription_id', planIds)
        .eq('status', 'active')
        .gte('end_date', todayStr);
      if (error) return {};
      
      const counts: Record<string, number> = {};
      data.forEach(sub => {
        counts[sub.subscription_id] = (counts[sub.subscription_id] || 0) + (sub.quantity || 1);
      });
      return counts;
    },
    enabled: !!plans && plans.length > 0,
  });

  const createPlan = useMutation({
    mutationFn: async () => {
      const existing = plans?.find(p => p.diet_type === dietType && p.slot_name === slotName && p.status === 'active');
      if (existing) {
        throw new Error('DUPLICATE_PLAN');
      }

      const slotObj = SLOT_OPTIONS.find(s => s.value === slotName)!;
      const { data, error } = await supabase.from('subscriptions').insert([{
        kitchen_id: kitchen?.id,
        diet_type: dietType,
        duration_type: 'monthly',
        slot_name: slotName,
        slot_target_time: slotTargetTime,
        delivery_type: 'home_delivery',
        price_per_day: price,
        vendor_fee: price * 0.7,
        delivery_fee: price * 0.2,
        capacity,
        operating_days: opDays === '7-day' ? ['mon','tue','wed','thu','fri','sat','sun'] : ['mon','tue','wed','thu','fri'],
        status: 'active'
      }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (newPlan) => {
      setModalVisible(false);
      queryClient.setQueryData(['vendor-plans', kitchen?.id], (old: any) => {
        if (!old) return [newPlan];
        return [newPlan, ...old];
      });
    },
    onError: (err: any) => {
      if (err.message === 'DUPLICATE_PLAN') {
        Alert.alert('Duplicate Plan', `You already have an active ${dietType.toUpperCase()} ${slotName.toUpperCase()} plan. Please create a different combination.`);
      } else {
        Alert.alert('Error', err.message);
      }
    }
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      const queryKey = ['vendor-plans', kitchen?.id];
      await queryClient.cancelQueries({ queryKey });
      const previousPlans = queryClient.getQueryData(queryKey);
      
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return [];
        return old.map((p: any) => p.id === id ? { ...p, status: 'cancelled' } : p);
      });
      
      return { previousPlans, queryKey };
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousPlans) queryClient.setQueryData(context.queryKey, context.previousPlans);
      Alert.alert('Error', 'Could not delete plan: ' + err.message);
    },
    onSettled: (data, error, variables, context: any) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey });
    }
  });

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Plan?', `Are you sure you want to delete your ${name} plan? Existing subscribers will finish their term, but new customers won't see it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePlan.mutate(id) }
    ]);
  };

  const selectedDiet = DIET_OPTIONS.find(d => d.value === dietType)!;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Meal Plans</Text>
          <Text style={styles.subtitle}>Manage your subscriptions</Text>
        </View>
        <TouchableOpacity 
          style={[styles.addButton, plans && plans.length >= 6 && { backgroundColor: '#FCA5A5' }]} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (plans && plans.length >= 6) {
              Alert.alert('Limit Reached', 'You can only have up to 6 active plans at a time.');
            } else {
              setDietType('veg');
              setSlotName('lunch');
              setPrice(120);
              setCapacity(50);
              setOpDays('7-day');
              setModalVisible(true);
            }
          }}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B6B" />}
      >
        {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color="#FF6B6B" />}
        {isError && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>Failed to load plans</Text>
            <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, isFetching && { opacity: 0.7 }]} disabled={isFetching}>
              {isFetching ? <ActivityIndicator color="#FFF" /> : <Text style={styles.retryText}>Retry</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && plans?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No Meal Plans Yet</Text>
            <Text style={styles.emptySub}>Create your first plan to start receiving orders.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
              setDietType('veg');
              setSlotName('lunch');
              setPrice(120);
              setCapacity(50);
              setOpDays('7-day');
              setModalVisible(true); 
            }}>
              <Text style={styles.emptyBtnText}>Create Your First Plan</Text>
            </TouchableOpacity>
          </View>
        )}

        {[...(plans || [])].sort((a, b) => a.slot_target_time.localeCompare(b.slot_target_time)).map((plan: any) => {
          const diet = DIET_OPTIONS.find(d => d.value === plan.diet_type);
          const slot = SLOT_OPTIONS.find(s => s.value === plan.slot_name);
          const subscribers = subCounts?.[plan.id] || 0;
          const isFull = subscribers >= plan.capacity;

          return (
            <View key={plan.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.dietBadge, { backgroundColor: diet?.bg }]}>
                  <Text>{diet?.emoji}</Text>
                  <Text style={[styles.badgeText, { color: diet?.color }]}>{plan.diet_type.toUpperCase()}</Text>
                </View>
                <Text style={styles.price}>₹{plan.price_per_day}<Text style={styles.perDay}>/day</Text></Text>
              </View>
              
              <View style={styles.titleRow}>
                <Text style={styles.planTitle}>{slot?.emoji} {plan.slot_name.toUpperCase()} PLAN</Text>
                <TouchableOpacity style={styles.deleteIconBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleDelete(plan.id, `${plan.diet_type} ${plan.slot_name}`); }}>
                  <Text style={styles.deleteIconText}>🗑️</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.progressWrap}>
                <View style={styles.progressRow}>
                  <Text style={styles.progressLabel}>Active Subscribers</Text>
                  <Text style={[styles.progressCount, isFull && { color: '#DC2626' }]}>{subscribers} / {plan.capacity}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min((subscribers / plan.capacity) * 100, 100)}%`, backgroundColor: isFull ? '#DC2626' : '#FF6B6B' }]} />
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.footerItem}>
                  <Text style={styles.footerLabel}>Target Time</Text>
                  <Text style={styles.footerValue}>{formatTime(plan.slot_target_time)}</Text>
                </View>
                <View style={styles.footerItem}>
                  <Text style={styles.footerLabel}>Your Share</Text>
                  <Text style={styles.footerValue}>₹{plan.vendor_fee}/day</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* CREATE PLAN MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        {/* ... (Modal content remains same) */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Meal Plan</Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setModalVisible(false); }}><Text style={styles.closeBtn}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContainer}>
          <Text style={styles.label}>Diet Type</Text>
          <View style={styles.chipRow}>
            {DIET_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.chip, dietType === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDietType(opt.value); }}>
                <Text>{opt.emoji}</Text>
                <Text style={[styles.chipText, dietType === opt.value && { color: opt.color, fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Meal Slot</Text>
          <View style={styles.chipRow}>
            {SLOT_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.chip, slotName === opt.value && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSlotName(opt.value); setSlotTargetTime(TIME_OPTIONS[opt.value][1].value); }}>
                <Text>{opt.emoji}</Text>
                <Text style={[styles.chipText, slotName === opt.value && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Target Delivery Time</Text>
          <View style={styles.chipRow}>
            {TIME_OPTIONS[slotName].map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.chip, slotTargetTime === opt.value && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSlotTargetTime(opt.value); }}>
                <Text style={[styles.chipText, slotTargetTime === opt.value && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Price per Day (₹)</Text>
          <View style={styles.chipRow}>
            {PRICE_OPTIONS.map(p => (
              <TouchableOpacity key={p} style={[styles.chip, price === p && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPrice(p); }}>
                <Text style={[styles.chipText, price === p && styles.chipTextActive]}>₹{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.priceNote}>Your share: ₹{(price * 0.8).toFixed(0)} · Delivery: ₹{(price * 0.2).toFixed(0)}</Text>

          <Text style={styles.label}>Daily Capacity (meals)</Text>
          <View style={styles.chipRow}>
            {[20, 30, 50, 75, 100].map(c => (
              <TouchableOpacity key={c} style={[styles.chip, capacity === c && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCapacity(c); }}>
                <Text style={[styles.chipText, capacity === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Operating Days</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, opDays === '7-day' && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpDays('7-day'); }}>
              <Text style={[styles.chipText, opDays === '7-day' && styles.chipTextActive]}>7 Days a Week</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, opDays === '5-day' && styles.chipActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpDays('5-day'); }}>
              <Text style={[styles.chipText, opDays === '5-day' && styles.chipTextActive]}>Mon-Fri Only</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Plan Summary</Text>
            <Text style={styles.summaryText}>{selectedDiet.emoji} {dietType} {slotName} at ₹{price}/day for {capacity} customers</Text>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={() => createPlan.mutate()} disabled={createPlan.isPending}>
            {createPlan.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Plan</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  addButton: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  list: { padding: 24 },
  errorWrap: { alignItems: 'center', paddingVertical: 40 },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 16, color: '#374151', marginBottom: 16 },
  retryBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: '#FFF', fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40, padding: 32, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#667085', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  emptyBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { fontWeight: '700', color: '#FFF' },
  card: { backgroundColor: '#FFF', padding: 24, borderRadius: 24, marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dietBadge: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '900', color: '#101828' },
  perDay: { fontSize: 14, color: '#667085', fontWeight: '500' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  planTitle: { fontSize: 18, fontWeight: '800', color: '#344054' },
  deleteIconBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 12 },
  deleteIconText: { fontSize: 16 },
  progressWrap: { marginBottom: 20, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 12, fontWeight: '600', color: '#667085' },
  progressCount: { fontSize: 13, fontWeight: '700', color: '#101828' },
  progressBarBg: { height: 6, backgroundColor: '#EAECF0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  cardFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 16 },
  footerItem: { flex: 1 },
  footerLabel: { fontSize: 12, color: '#98A2B3', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  footerValue: { fontSize: 14, color: '#101828', fontWeight: '600' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#344054', marginBottom: 12, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#EAECF0' },
  chipActive: { backgroundColor: '#FEF0EC', borderColor: '#FF6B6B' },
  chipText: { fontSize: 14, color: '#667085', fontWeight: '600' },
  chipTextActive: { color: '#FF6B6B', fontWeight: '700' },
  priceNote: { fontSize: 13, color: '#667085', marginTop: 10, fontStyle: 'italic' },
  summary: { backgroundColor: '#F9FAFB', padding: 20, borderRadius: 16, marginTop: 24 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#344054', marginBottom: 8 },
  summaryText: { fontSize: 15, color: '#667085', lineHeight: 22 },
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
