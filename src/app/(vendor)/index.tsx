import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [fssai, setFssai] = useState('');

  const { data: kitchen, isLoading } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kitchens').select('*').eq('vendor_id', user?.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
    enabled: !!user?.id,
  });

  const createKitchen = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('kitchens').insert([{ vendor_id: user?.id, name, address, fssai_number: fssai }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] })
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  // --- ONBOARDING VIEW ---
  if (!kitchen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to Vindu</Text>
            <Text style={styles.subtitle}>Let's set up your kitchen profile to get started.</Text>
          </View>
          
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kitchen Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Annapurna Tiffins" placeholderTextColor="#98A2B3" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Kitchen Address</Text>
              <TextInput style={[styles.input, styles.textArea]} value={address} onChangeText={setAddress} placeholder="Full operational address" placeholderTextColor="#98A2B3" multiline />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>FSSAI License Number</Text>
              <TextInput style={styles.input} value={fssai} onChangeText={setFssai} placeholder="14-digit number" placeholderTextColor="#98A2B3" keyboardType="numeric" />
            </View>
            
            <TouchableOpacity 
              style={[styles.button, (!name || !address || createKitchen.isPending) && styles.buttonDisabled]} 
              onPress={() => createKitchen.mutate()} 
              disabled={!name || !address || createKitchen.isPending}
            >
              {createKitchen.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Complete Setup</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- DASHBOARD VIEW ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.dashboardContainer}>
        <View style={styles.dashboardHeader}>
          <Text style={styles.dashboardGreeting}>Hello,</Text>
          <Text style={styles.dashboardTitle}>{kitchen.name}</Text>
          <View style={[styles.statusBadge, kitchen.status === 'active' ? styles.statusActive : styles.statusPending]}>
            <Text style={[styles.statusText, kitchen.status === 'active' ? styles.statusTextActive : styles.statusTextPending]}>
              {(kitchen.status ?? 'pending').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today's Orders</Text>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statSub}>Meals to prepare</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active Subs</Text>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statSub}>Current customers</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Kitchen Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{kitchen.address}</Text>
          </View>
          {kitchen.fssai_number && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>FSSAI No.</Text>
              <Text style={styles.infoValue}>{kitchen.fssai_number}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F9FC' },
  container: { padding: 24 },
  header: { marginBottom: 32, marginTop: 20 },
  title: { fontSize: 32, fontWeight: '800', color: '#101828', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#667085', lineHeight: 24 },
  formCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#344054', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  textArea: { height: 100, paddingTop: 14, textAlignVertical: 'top' },
  button: { backgroundColor: '#FF6B6B', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#FFA3A3' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  
  dashboardContainer: { padding: 24 },
  dashboardHeader: { marginBottom: 32, marginTop: 10 },
  dashboardGreeting: { fontSize: 18, color: '#667085', fontWeight: '500' },
  dashboardTitle: { fontSize: 32, fontWeight: '800', color: '#101828', marginTop: 4, marginBottom: 12 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusActive: { backgroundColor: '#ECFDF3' },
  statusPending: { backgroundColor: '#FFFAEB' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#027A48' },
  statusTextPending: { color: '#B54708' },
  
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  statLabel: { fontSize: 14, color: '#667085', fontWeight: '600', marginBottom: 8 },
  statValue: { fontSize: 36, fontWeight: '900', color: '#FF6B6B', marginBottom: 4 },
  statSub: { fontSize: 12, color: '#98A2B3' },
  
  infoCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  infoTitle: { fontSize: 18, fontWeight: '700', color: '#101828', marginBottom: 16 },
  infoRow: { borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingVertical: 12 },
  infoLabel: { fontSize: 13, color: '#667085', marginBottom: 4 },
  infoValue: { fontSize: 15, color: '#344054', fontWeight: '500' }
});
