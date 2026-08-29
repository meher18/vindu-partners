import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, Modal, TextInput, ScrollView, Switch, Alert } from 'react-native';
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

  // Fetch Kitchen ID
  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch Existing Plans
  const { data: plans, isLoading } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!kitchen?.id,
  });

  // Create Plan Mutation
  const createPlan = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('subscriptions').insert([{
        kitchen_id: kitchen?.id,
        diet_type: dietType,
        duration_type: 'monthly', // simplified for now
        slot_name: slotName,
        slot_target_time: slotName === 'lunch' ? '13:00:00' : '20:00:00',
        delivery_type: 'home_delivery',
        price_per_day: parseFloat(price),
        vendor_fee: parseFloat(price) * 0.8, // 80% to vendor
        delivery_fee: parseFloat(price) * 0.2, // 20% for delivery
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Active Meal Plans</Text>
        <Button title="+ Add Plan" onPress={() => setModalVisible(true)} color="orange" />
      </View>

      <ScrollView style={styles.list}>
        {isLoading && <Text>Loading plans...</Text>}
        {plans?.length === 0 && <Text style={styles.empty}>You have no meal plans yet.</Text>}
        
        {plans?.map((plan) => (
          <View key={plan.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.planTitle}>{plan.diet_type.toUpperCase()} {plan.slot_name.toUpperCase()}</Text>
              <Text style={styles.price}>₹{plan.price_per_day}/day</Text>
            </View>
            <Text style={styles.detail}>Capacity: {plan.capacity} meals</Text>
            <Text style={styles.detail}>Target Delivery: {plan.slot_target_time}</Text>
          </View>
        ))}
      </ScrollView>

      {/* CREATE PLAN MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Create New Meal Plan</Text>
          
          <Text style={styles.label}>Diet Type (veg, non-veg, vegan)</Text>
          <TextInput style={styles.input} value={dietType} onChangeText={setDietType} />

          <Text style={styles.label}>Slot (lunch, dinner, breakfast)</Text>
          <TextInput style={styles.input} value={slotName} onChangeText={setSlotName} />

          <Text style={styles.label}>Customer Price Per Day (₹)</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" />

          <Text style={styles.label}>Max Daily Capacity (Meals)</Text>
          <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="numeric" />

          <View style={styles.modalButtons}>
            <Button title="Cancel" onPress={() => setModalVisible(false)} color="gray" />
            <Button title="Save Plan" onPress={() => createPlan.mutate()} color="orange" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold' },
  list: { padding: 20 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  planTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  price: { fontSize: 16, fontWeight: 'bold', color: 'orange' },
  detail: { color: '#666', marginTop: 2 },
  modalContainer: { flex: 1, padding: 30, backgroundColor: '#fff', paddingTop: 60 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }
});
