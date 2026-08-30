import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorPlans() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);

  // Form State
  const [dietType, setDietType] = useState('veg');
  const [slotName, setSlotName] = useState('lunch');
  const [price, setPrice] = useState('120');
  const [capacity, setCapacity] = useState('50');

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: plans, isLoading } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!kitchen?.id,
  });

  const createPlan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('subscriptions').insert([{
        kitchen_id: kitchen?.id,
        diet_type: dietType.toLowerCase(),
        duration_type: 'monthly',
        slot_name: slotName.toLowerCase(),
        slot_target_time: slotName.toLowerCase() === 'dinner' ? '20:00:00' : '13:00:00',
        delivery_type: 'home_delivery',
        price_per_day: parseFloat(price),
        vendor_fee: parseFloat(price) * 0.8,
        delivery_fee: parseFloat(price) * 0.2,
        capacity: parseInt(capacity),
        status: 'active'
      }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['vendor-plans', kitchen?.id] });
    },
    onError: (err) => Alert.alert('Error', err.message)
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Meal Plans</Text>
          <Text style={styles.subtitle}>Manage your subscriptions</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading && <ActivityIndicator style={{marginTop: 40}} color="#FF6B6B" />}
        {plans?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>No Meal Plans Yet</Text>
            <Text style={styles.emptySub}>Create your first plan to start receiving orders.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyBtnText}>Create Plan</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {plans?.map((plan) => (
          <View key={plan.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.dietBadge, plan.diet_type === 'veg' ? styles.badgeVeg : styles.badgeNonVeg]}>
                <Text style={[styles.badgeText, plan.diet_type === 'veg' ? styles.badgeTextVeg : styles.badgeTextNonVeg]}>
                  {plan.diet_type.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.price}>₹{plan.price_per_day} <Text style={styles.perDay}>/day</Text></Text>
            </View>
            <Text style={styles.planTitle}>{plan.slot_name.toUpperCase()} PLAN</Text>
            
            <View style={styles.cardFooter}>
              <View style={styles.footerItem}>
                <Text style={styles.footerLabel}>Capacity</Text>
                <Text style={styles.footerValue}>{plan.capacity} meals</Text>
              </View>
              <View style={styles.footerItem}>
                <Text style={styles.footerLabel}>Target Time</Text>
                <Text style={styles.footerValue}>{plan.slot_target_time.slice(0, 5)}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CREATE PLAN MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Meal Plan</Text>
          <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeBtn}>Close</Text></TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Diet Type (veg, non-veg, vegan)</Text>
            <TextInput style={styles.input} value={dietType} onChangeText={setDietType} />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Slot (lunch, dinner)</Text>
            <TextInput style={styles.input} value={slotName} onChangeText={setSlotName} />
          </View>

          <View style={styles.rowGrid}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Price / Day (₹)</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" />
            </View>
            <View style={{ width: 16 }} />
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Max Capacity</Text>
              <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="numeric" />
            </View>
          </View>

          <TouchableOpacity 
            style={styles.saveBtn} 
            onPress={() => createPlan.mutate()} 
            disabled={createPlan.isPending}
          >
            {createPlan.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Plan</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  addButton: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  list: { padding: 24 },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 32, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#667085', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  emptyBtn: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { fontWeight: '600', color: '#344054' },

  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dietBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeVeg: { backgroundColor: '#ECFDF3' },
  badgeTextVeg: { color: '#027A48', fontSize: 12, fontWeight: '700' },
  badgeNonVeg: { backgroundColor: '#FEF3F2' },
  badgeTextNonVeg: { color: '#B42318', fontSize: 12, fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '900', color: '#101828' },
  perDay: { fontSize: 14, color: '#667085', fontWeight: '500' },
  planTitle: { fontSize: 18, fontWeight: '800', color: '#344054', marginBottom: 20 },
  cardFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 16 },
  footerItem: { flex: 1 },
  footerLabel: { fontSize: 12, color: '#98A2B3', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  footerValue: { fontSize: 15, color: '#101828', fontWeight: '600' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  inputGroup: { marginBottom: 20 },
  rowGrid: { flexDirection: 'row' },
  label: { fontSize: 13, fontWeight: '600', color: '#344054', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12, marginBottom: 40 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
