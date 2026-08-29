import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [fssai, setFssai] = useState('');

  // Fetch Vendor's Kitchen
  const { data: kitchen, isLoading } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kitchens')
        .select('*')
        .eq('vendor_id', user?.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"
      return data || null;
    },
    enabled: !!user?.id,
  });

  // Create Kitchen Mutation
  const createKitchen = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('kitchens')
        .insert([{
          vendor_id: user?.id,
          name,
          address,
          fssai_number: fssai
        }])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] });
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    }
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // --- ONBOARDING VIEW ---
  if (!kitchen) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Vindu Partner</Text>
        <Text style={styles.subtitle}>Let's set up your kitchen first.</Text>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Kitchen Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Annapurna Tiffins" />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Kitchen Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Full address" multiline />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>FSSAI Number</Text>
          <TextInput style={styles.input} value={fssai} onChangeText={setFssai} placeholder="14-digit FSSAI number" keyboardType="numeric" />
        </View>

        <Button 
          title={createKitchen.isPending ? "Creating..." : "Set Up Kitchen"} 
          onPress={() => createKitchen.mutate()} 
          disabled={!name || !address || createKitchen.isPending}
        />
      </View>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{kitchen.name} Dashboard</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Fulfillment</Text>
        <Text style={styles.cardNumber}>0</Text>
        <Text style={styles.cardSub}>Meals to prepare</Text>
      </View>
      <View style={{ marginTop: 20 }}>
        <Text style={styles.subtitle}>Kitchen Details</Text>
        <Text>Status: {kitchen.status.toUpperCase()}</Text>
        <Text>Address: {kitchen.address}</Text>
        {kitchen.fssai_number && <Text>FSSAI: {kitchen.fssai_number}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30 },
  inputContainer: { marginBottom: 20 },
  label: { marginBottom: 5, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8 },
  card: { backgroundColor: '#f0f4f8', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#444' },
  cardNumber: { fontSize: 48, fontWeight: 'bold', color: '#0066cc', marginVertical: 10 },
  cardSub: { fontSize: 14, color: '#666' }
});
