import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Modal, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalDayShort = () => {
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  return days[new Date().getDay()];
};

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [fssai, setFssai] = useState('');
  const [radius, setRadius] = useState('5');

  const [holidayModal, setHolidayModal] = useState(false);
  const [holidayDate, setHolidayDate] = useState(getLocalToday());
  const [holidayReason, setHolidayReason] = useState('Kitchen Closed');

  const { data: kitchen, isLoading } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kitchens').select('*').eq('vendor_id', user?.id).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
    enabled: !!user?.id,
  });

  const { data: plans } = useQuery({
    queryKey: ['vendor-plans-dashboard', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('subscriptions').select('id, diet_type, slot_name').eq('kitchen_id', kitchen?.id).neq('status', 'cancelled');
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const { data: menus } = useQuery({
    queryKey: ['vendor-menus-dashboard', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return [];
      const { data } = await supabase
        .from('menus')
        .select('subscription_id, effective_date')
        .in('subscription_id', plans.map(p => p.id))
        .gte('effective_date', getLocalToday());
      return data || [];
    },
    enabled: !!plans && plans.length > 0,
  });

  const { data: prepForecast } = useQuery({
    queryKey: ['vendor-prep-forecast', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return { today: { total: 0, breakdown: {} }, tomorrow: { total: 0, breakdown: {} } };
      
      const todayStr = getLocalToday();
      const d = new Date(todayStr);
      d.setDate(d.getDate() + 1);
      const tomorrowStr = d.toISOString().split('T')[0];
      
      const todayDay = new Date(todayStr).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const tomorrowDay = new Date(tomorrowStr).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

      // 1. Fetch all active subscriptions encompassing these dates
      const { data: cSubs } = await supabase
        .from('customer_subscriptions')
        .select('id, quantity, subscription_id, start_date, end_date')
        .in('subscription_id', plans.map(p => p.id))
        .eq('status', 'active')
        .lte('start_date', tomorrowStr)
        .gte('end_date', todayStr);
        
      if (!cSubs || cSubs.length === 0) return { today: { total: 0, breakdown: {} }, tomorrow: { total: 0, breakdown: {} } };

      // 2. Fetch skips for these dates
      const { data: skips } = await supabase
        .from('skips')
        .select('customer_subscription_id, skip_date')
        .in('customer_subscription_id', cSubs.map(cs => cs.id))
        .in('skip_date', [todayStr, tomorrowStr]);

      const skipSet = new Set(skips?.map(s => `${s.customer_subscription_id}_${s.skip_date}`));

      const calc = (dateStr: string, dayShort: string) => {
        let total = 0;
        const breakdown: Record<string, number> = {};
        
        cSubs.forEach(sub => {
          if (sub.start_date > dateStr || sub.end_date < dateStr) return; // Not active on this specific day
          if (skipSet.has(`${sub.id}_${dateStr}`)) return; // Customer skipped this day!
          
          const plan = plans.find(p => p.id === sub.subscription_id);
          if (!plan) return;
          if (plan.operating_days && !plan.operating_days.includes(dayShort)) return; // Kitchen closed for this plan today
          
          const qty = sub.quantity || 1;
          total += qty;
          const key = `${plan.diet_type.toUpperCase()} ${plan.slot_name.toUpperCase()}`;
          breakdown[key] = (breakdown[key] || 0) + qty;
        });
        return { total, breakdown };
      };

      return {
        today: calc(todayStr, todayDay),
        tomorrow: calc(tomorrowStr, tomorrowDay)
      };
    },
    enabled: !!plans && plans.length > 0,
  });

  const { data: holidays } = useQuery({
    queryKey: ['vendor-holidays', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchen_holidays').select('*').eq('kitchen_id', kitchen?.id).gte('holiday_date', new Date().toISOString().split('T')[0]).order('holiday_date', { ascending: true });
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const createKitchen = useMutation({
    mutationFn: async () => {
      if (!name || !address || !fssai || !radius) throw new Error("Please fill all fields");
      const radiusInt = parseInt(radius);
      if (isNaN(radiusInt) || radiusInt <= 0) throw new Error("Delivery radius must be a positive number");
      
      const { data, error } = await supabase.from('kitchens').insert([{ 
        vendor_id: user?.id, name, address, fssai_number: fssai, delivery_radius_km: radiusInt 
      }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] }),
    onError: (err: any) => Alert.alert('Error', err.message)
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(holidayDate)) throw new Error("Date must be in YYYY-MM-DD format.");
      if (holidayDate < getLocalToday()) throw new Error("You cannot add a holiday in the past.");
      
      const { error } = await supabase.from('kitchen_holidays').insert([{ kitchen_id: kitchen?.id, holiday_date: holidayDate, reason: holidayReason }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setHolidayModal(false);
      queryClient.invalidateQueries({ queryKey: ['vendor-holidays', kitchen?.id] });
    },
    onError: (err: any) => Alert.alert('Error', err.message)
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('kitchen_holidays').delete().eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-holidays', kitchen?.id] })
  });

  // Check for missing menus for tomorrow
  let missingMenusAlert = false;
  let missingPlanNames: string[] = [];
  if (plans && menus) {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`;
    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    const tmrwDayShort = days[tmrw.getDay()];
    
    plans.forEach(plan => {
      // Don't alert if the plan doesn't operate tomorrow
      if (plan.operating_days && !plan.operating_days.includes(tmrwDayShort)) return;
      
      const hasMenu = menus.some(m => m.subscription_id === plan.id && m.effective_date === tmrwStr);
      if (!hasMenu) {
        missingMenusAlert = true;
        missingPlanNames.push(`${plan.diet_type.toUpperCase()} ${plan.slot_name}`);
      }
    });
  }

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF6B6B" /></View>;

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
              <Text style={styles.label}>Delivery Radius (km)</Text>
              <TextInput style={styles.input} value={radius} onChangeText={setRadius} placeholder="e.g. 5" keyboardType="numeric" placeholderTextColor="#98A2B3" />
              <Text style={styles.helpText}>Customers outside this radius will not see your kitchen.</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>FSSAI License Number</Text>
              <TextInput style={styles.input} value={fssai} onChangeText={setFssai} placeholder="14-digit FSSAI number" placeholderTextColor="#98A2B3" keyboardType="number-pad" maxLength={14} />
            </View>
            
            <TouchableOpacity style={styles.submitBtn} onPress={() => createKitchen.mutate()} disabled={createKitchen.isPending}>
              {createKitchen.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Create Kitchen</Text>}
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
          <View style={{ flex: 1 }}>
            <Text style={styles.dashboardGreeting}>Hello,</Text>
            <Text style={styles.dashboardTitle}>{kitchen.name}</Text>
            <View style={[styles.statusBadge, kitchen.status === 'active' ? styles.statusActive : styles.statusPending]}>
              <Text style={[styles.statusText, kitchen.status === 'active' ? styles.statusTextActive : styles.statusTextPending]}>
                {(kitchen.status ?? 'pending').toUpperCase()}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.holidayBtn} onPress={() => setHolidayModal(true)}>
            <Text style={styles.holidayBtnText}>🗓️ Holidays</Text>
          </TouchableOpacity>
        </View>

        {(kitchen.status ?? 'pending') === 'pending' && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>🔍 Your kitchen is under review. Once approved by the Vindu team, customers can discover you.</Text>
          </View>
        )}

        {missingMenusAlert && (
          <View style={styles.missingMenuBanner}>
            <Text style={styles.missingMenuEmoji}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.missingMenuTitle}>Action Required for Tomorrow!</Text>
              <Text style={styles.missingMenuText}>You have not published a menu for tomorrow for: {missingPlanNames.join(', ')}</Text>
            </View>
          </View>
        )}

        {holidays && holidays.length > 0 && (
          <View style={styles.holidayBanner}>
            <Text style={styles.holidayBannerTitle}>Upcoming Holidays</Text>
            {holidays.map((h: any) => {
              const [y, m, d] = h.holiday_date.split('-');
              const localDate = new Date(Number(y), Number(m) - 1, Number(d));
              return (
                <View key={h.id} style={styles.holidayRow}>
                  <Text style={styles.holidayDate}>{localDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <Text style={styles.holidayReason}>{h.reason}</Text>
                  <TouchableOpacity onPress={() => {
                    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
                    Alert.alert('Remove Holiday?', `Are you sure you want to cancel the holiday on ${localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}?`, [
                      { text: 'Keep It', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => deleteHoliday.mutate(h.id) }
                    ]);
                  }}>
                    <Text style={styles.holidayDelete}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { paddingBottom: 12 }]}>
            <Text style={styles.statLabel}>Today's Prep</Text>
            <Text style={styles.statValue}>{prepForecast?.today.total || 0}</Text>
            <Text style={styles.statSub}>Meals to cook today</Text>
            {prepForecast?.today.breakdown && Object.keys(prepForecast.today.breakdown).length > 0 && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 6 }}>
                {Object.entries(prepForecast.today.breakdown).map(([key, qty]) => (
                  <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{key}</Text>
                    <Text style={{ fontSize: 13, color: '#FF6B6B', fontWeight: '800' }}>{qty}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={[styles.statCard, { paddingBottom: 12 }]}>
            <Text style={styles.statLabel}>Tomorrow's Groceries</Text>
            <Text style={styles.statValue}>{prepForecast?.tomorrow.total || 0}</Text>
            <Text style={styles.statSub}>Forecasted inventory</Text>
            {prepForecast?.tomorrow.breakdown && Object.keys(prepForecast.tomorrow.breakdown).length > 0 && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 6 }}>
                {Object.entries(prepForecast.tomorrow.breakdown).map(([key, qty]) => (
                  <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>{key}</Text>
                    <Text style={{ fontSize: 13, color: '#FF6B6B', fontWeight: '800' }}>{qty}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Kitchen Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{kitchen.address}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Delivery Radius</Text>
            <Text style={styles.infoValue}>{kitchen.delivery_radius_km} km</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>FSSAI</Text>
            <Text style={styles.infoValue}>{kitchen.fssai_number}</Text>
          </View>
        </View>

        {/* LOGOUT BUTTON FOR TESTING */}
        <TouchableOpacity style={{ marginTop: 40, padding: 16, backgroundColor: '#FEF2F2', borderRadius: 12, alignItems: 'center' }} onPress={() => supabase.auth.signOut()}>
          <Text style={{ color: '#DC2626', fontWeight: '700' }}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* HOLIDAY MODAL */}
      <Modal visible={holidayModal} animationType="slide" presentationStyle="formSheet">
        <View style={{ flex: 1, backgroundColor: '#FFF', padding: 24, paddingTop: 40 }}>
          <Text style={styles.title}>Mark Kitchen Closed</Text>
          <Text style={styles.subtitle}>Select a date to pause all subscriptions automatically.</Text>
          
          <Text style={[styles.label, { marginTop: 24 }]}>Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={holidayDate} onChangeText={setHolidayDate} placeholder="e.g. 2026-10-31" />
          
          <Text style={[styles.label, { marginTop: 16 }]}>Reason (Optional)</Text>
          <TextInput style={styles.input} value={holidayReason} onChangeText={setHolidayReason} placeholder="e.g. Diwali Festival" />

          <TouchableOpacity style={[styles.submitBtn, { marginTop: 32 }]} onPress={() => addHoliday.mutate()} disabled={addHoliday.isPending}>
            {addHoliday.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Holiday</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setHolidayModal(false)}>
            <Text style={{ color: '#667085', fontWeight: '700', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 32, marginTop: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#667085', lineHeight: 24 },
  formCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#344054', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  textArea: { height: 100, textAlignVertical: 'top' },
  helpText: { fontSize: 12, color: '#667085', marginTop: 6, fontStyle: 'italic' },
  submitBtn: { backgroundColor: '#FF6B6B', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  
  dashboardContainer: { padding: 24 },
  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 10 },
  dashboardGreeting: { fontSize: 18, color: '#667085', fontWeight: '500' },
  dashboardTitle: { fontSize: 32, fontWeight: '800', color: '#101828', marginTop: 4, marginBottom: 12 },
  holidayBtn: { backgroundColor: '#FEF0EC', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  holidayBtnText: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusActive: { backgroundColor: '#ECFDF3' },
  statusPending: { backgroundColor: '#FFFAEB' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#027A48' },
  statusTextPending: { color: '#B54708' },
  
  pendingBanner: { backgroundColor: '#FFFAEB', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FEF0C7' },
  pendingBannerText: { color: '#B54708', fontSize: 14, lineHeight: 20 },
  
  missingMenuBanner: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FEE2E2', alignItems: 'flex-start' },
  missingMenuEmoji: { fontSize: 24, marginRight: 12 },
  missingMenuTitle: { fontSize: 15, fontWeight: '800', color: '#991B1B', marginBottom: 4 },
  missingMenuText: { fontSize: 14, color: '#B91C1C', lineHeight: 20 },

  holidayBanner: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#EAECF0' },
  holidayBannerTitle: { fontSize: 14, fontWeight: '700', color: '#344054', marginBottom: 12 },
  holidayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  holidayDate: { fontSize: 14, fontWeight: '600', color: '#101828', width: 90 },
  holidayReason: { flex: 1, fontSize: 14, color: '#667085' },
  holidayDelete: { color: '#DC2626', fontWeight: '700', fontSize: 16, paddingLeft: 10 },
  
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
