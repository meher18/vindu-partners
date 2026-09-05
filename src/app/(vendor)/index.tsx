import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

import { getISTDateString } from '@/utils/dateUtils';

const getLocalDayShort = () => {
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  return days[new Date().getDay()];
};

export default function VendorDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fssai, setFssai] = useState('');
  const [radius, setRadius] = useState('5');

  const [holidayModal, setHolidayModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);
  const [holidayDate, setHolidayDate] = useState(getISTDateString());
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

    const { data: plans, isLoading: isPlansLoading } = useQuery({
    queryKey: ['vendor-plans-dashboard', kitchen?.id],
    queryFn: async () => {
      // CRITICAL: We MUST fetch cancelled plans here too, because the vendor MUST STILL COOK 
      // for existing customers until their subscriptions naturally expire.
      const { data } = await supabase.from('subscriptions').select('id, diet_type, slot_name, operating_days, slot_target_time, status, capacity, vendor_fee').eq('kitchen_id', kitchen?.id);
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const { data: menus, isLoading: isMenusLoading } = useQuery({
    queryKey: ['vendor-menus-dashboard', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return [];
      const { data } = await supabase
        .from('menus')
        .select('subscription_id, effective_date')
        .in('subscription_id', plans.map(p => p.id))
        .gte('effective_date', getISTDateString());
      return data || [];
    },
    enabled: !!plans && plans.length > 0,
  });

  const { data: prepForecast, isLoading: isForecastLoading } = useQuery({
    queryKey: ['vendor-prep-forecast', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return { today: { total: 0, breakdown: {} }, tomorrow: { total: 0, breakdown: {} } };
      
      const todayStr = getISTDateString();
      const d = new Date(todayStr);
      d.setDate(d.getDate() + 1);
      const tomorrowStr = getISTDateString(d);

      const days = ['sun','mon','tue','wed','thu','fri','sat'];
      const todayShort = days[new Date(todayStr).getDay()];
      const tomorrowShort = days[d.getDay()];

      // 1. Fetch active customer subscriptions for our kitchen's plans
      const { data: cSubs } = await supabase
        .from('customer_subscriptions')
        .select('id, subscription_id, quantity, start_date, end_date')
        .in('subscription_id', plans.map(p => p.id))
        .eq('status', 'active');

      // 2. Fetch skips for these dates
      const { data: skips } = await supabase
        .from('skips')
        .select('customer_subscription_id, date')
        .in('customer_subscription_id', cSubs?.map(cs => cs.id) || [])
        .in('date', [todayStr, tomorrowStr]);

      const skipSet = new Set(skips?.map(s => `${s.customer_subscription_id}_${s.date}`));

      // 3. Fetch holidays to verify the kitchen is actually open
      const { data: hols } = await supabase
        .from('kitchen_holidays')
        .select('holiday_date')
        .eq('kitchen_id', kitchen?.id)
        .in('holiday_date', [todayStr, tomorrowStr]);
        
      const holidaySet = new Set(hols?.map(h => h.holiday_date));

      const calc = (dateStr: string, dayShort: string) => {
        let total = 0;
        let revenue = 0;
        let capacity = 0;
        const breakdown: Record<string, number> = {};
        
        if (holidaySet.has(dateStr)) return { total: 0, breakdown: {}, revenue: 0, capacity: 0 };
        
        plans.forEach(p => {
          if (p.status === 'active' && (!p.operating_days || p.operating_days.includes(dayShort))) {
            capacity += (p.capacity || 0);
          }
        });

        cSubs?.forEach(sub => {
          if (sub.start_date > dateStr || sub.end_date < dateStr) return; 
          if (skipSet.has(`${sub.id}_${dateStr}`)) return; 
          
          const plan = plans.find(p => p.id === sub.subscription_id);
          if (!plan) return;
          if (plan.operating_days && !plan.operating_days.includes(dayShort)) return; 
          
          const qty = sub.quantity || 1;
          total += qty;
          revenue += (plan.vendor_fee || 0) * qty;
          const key = `${plan.diet_type.toUpperCase()} ${plan.slot_name.toUpperCase()}`;
          breakdown[key] = (breakdown[key] || 0) + qty;
        });
        return { total, breakdown, revenue, capacity };
      };

      return {
        today: calc(todayStr, todayShort),
        tomorrow: calc(tomorrowStr, tomorrowShort)
      };
    },
    enabled: !!plans && plans.length > 0,
  });

  const { data: ratingsData, isLoading: isRatingsLoading } = useQuery({
    queryKey: ['vendor-ratings', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('ratings')
        .select('food_stars, review_text, created_at, profiles(full_name)')
        .eq('kitchen_id', kitchen?.id)
        .order('created_at', { ascending: false });
        
      if (!data) return { avg: 0, reviews: [] };
      
      const foodRatings = data.filter(r => r.food_stars != null);
      const avg = foodRatings.length > 0 
        ? (foodRatings.reduce((sum, r) => sum + r.food_stars, 0) / foodRatings.length).toFixed(1) 
        : 0;
        
      return { avg, reviews: data.filter(r => r.review_text).slice(0, 3) };
    },
    enabled: !!kitchen?.id,
  });
  
  const { data: holidays, isLoading: isHolidaysLoading } = useQuery({
    queryKey: ['vendor-holidays', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchen_holidays').select('*').eq('kitchen_id', kitchen?.id).gte('holiday_date', getISTDateString()).order('holiday_date', { ascending: true });
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const createKitchen = useMutation({
    mutationFn: async () => {
      // Comprehensive validation
      if (!name.trim()) throw new Error("Kitchen name is required");
      if (!address.trim()) throw new Error("Address is required");
      if (!phone.trim()) throw new Error("Dispatch phone is required");
      if (!fssai.trim()) throw new Error("FSSAI license is required");
      if (!radius.trim()) throw new Error("Delivery radius is required");

      // Phone validation
      const phoneClean = phone.replace(/\D/g, '');
      if (phoneClean.length !== 10) throw new Error("Phone must be exactly 10 digits");

      // Radius validation
      const radiusInt = parseInt(radius);
      if (isNaN(radiusInt) || radiusInt <= 0) throw new Error("Delivery radius must be a positive number");
      if (radiusInt > 50) throw new Error("Delivery radius cannot exceed 50 km");

      // FSSAI validation (14 digits)
      const fssaiClean = fssai.replace(/\D/g, '');
      if (fssaiClean.length !== 14) throw new Error("FSSAI license must be exactly 14 digits");

      // Address length check
      if (address.length < 10) throw new Error("Address must be at least 10 characters");
      
      // Update the vendor's profile with their dispatch contact number
      const { error: pErr } = await supabase.from('profiles').update({ phone: phoneClean }).eq('id', user?.id);
      if (pErr) throw pErr;

      const { data, error } = await supabase.from('kitchens').insert([{ 
        vendor_id: user?.id, 
        name: name.trim(), 
        address: address.trim(), 
        fssai_number: fssaiClean,
        delivery_radius_km: radiusInt,
        status: 'pending'  // All new kitchens start as pending
      }]).select().single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] });
      Alert.alert('Kitchen Created!', 'Your kitchen profile is now pending admin review. You can start adding meal plans while we verify your details.');
    },
    onError: (err: any) => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      Alert.alert('Error Creating Kitchen', err.message);
    }
  });

  const [editProfileModal, setEditProfileModal] = useState(false);
  const updateKitchen = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Kitchen name is required");
      if (!address.trim()) throw new Error("Address is required");
      if (!phone.trim()) throw new Error("Dispatch phone is required");
      if (!fssai.trim()) throw new Error("FSSAI license is required");
      if (!radius.trim()) throw new Error("Delivery radius is required");

      const phoneClean = phone.replace(/\D/g, '');
      if (phoneClean.length !== 10) throw new Error("Phone must be exactly 10 digits");
      const radiusInt = parseInt(radius);
      if (isNaN(radiusInt) || radiusInt <= 0) throw new Error("Delivery radius must be a positive number");
      const fssaiClean = fssai.replace(/\D/g, '');
      if (fssaiClean.length !== 14) throw new Error("FSSAI license must be exactly 14 digits");

      await supabase.from('profiles').update({ phone: phoneClean }).eq('id', user?.id);
      
      const { error } = await supabase.from('kitchens').update({ 
        name: name.trim(), 
        address: address.trim(), 
        fssai_number: fssaiClean,
        delivery_radius_km: radiusInt
      }).eq('id', kitchen?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      queryClient.invalidateQueries({ queryKey: ['vendor-kitchen', user?.id] });
      setEditProfileModal(false);
      Alert.alert('Success', 'Profile updated');
    },
    onError: (err: any) => Alert.alert('Error', err.message)
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(holidayDate)) throw new Error("Date must be in YYYY-MM-DD format (e.g., 2026-10-31)");
      
      // Validate date is actually valid
      const [year, month, day] = holidayDate.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);
      if (isNaN(parsedDate.getTime())) throw new Error("Invalid date entered");
      
      const todayStr = getISTDateString();
      if (holidayDate < todayStr) throw new Error("Cannot mark a date in the past as a holiday");
      if (holidayDate === todayStr) throw new Error("Cannot mark today as a holiday. Only future dates are allowed.");
      
      // Check if already marked as holiday
      if (holidays?.some(h => h.holiday_date === holidayDate)) {
        throw new Error('This date is already marked as a holiday');
      }
      
      // If marking for very soon, warn about prep times
      if (holidayDate === todayStr) {
        if (!plans || plans.length === 0) throw new Error("Cannot verify prep times. Please add a meal plan first.");
        
        let earliestCutoff: Date | null = null;
        for (const plan of plans) {
          if (!plan.slot_target_time) continue;
          const [h, m, s] = plan.slot_target_time.split(':').map(Number);
          const target = new Date();
          target.setHours(h, m, s, 0);
          const cutoff = new Date(target.getTime() - 60 * 60 * 1000); // 1 hour before prep
          if (!earliestCutoff || cutoff < earliestCutoff) {
            earliestCutoff = cutoff;
          }
        }
        
        if (earliestCutoff && new Date() > earliestCutoff) {
          throw new Error("Prep window has already started for today's earliest meal. You can only declare holidays for tomorrow onwards.");
        }
      }
      
      const reason = holidayReason.trim() || 'Kitchen Closed';
      const { error } = await supabase.from('kitchen_holidays').insert([{ 
        kitchen_id: kitchen?.id, 
        holiday_date: holidayDate, 
        reason 
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      setHolidayModal(false);
      setHolidayDate(getISTDateString());
      setHolidayReason('Kitchen Closed');
      queryClient.invalidateQueries({ queryKey: ['vendor-holidays', kitchen?.id] });
      Alert.alert('Holiday Marked', 'Your kitchen will not accept orders for this date. All customers will be notified.');
    },
    onError: (err: any) => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      Alert.alert('Error', err.message);
    }
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      if (!id) throw new Error('Holiday record not found');
      const { error } = await supabase.from('kitchen_holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      queryClient.invalidateQueries({ queryKey: ['vendor-holidays', kitchen?.id] });
      Alert.alert('Holiday Removed', 'The kitchen will accept orders for this date again.');
    },
    onError: (err: any) => {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      Alert.alert('Unable to Remove Holiday', err.message || 'Please try again.');
    },
  });

  // Check for missing menus for today and tomorrow
  let missingMenusAlert = false;
  let missingPlanNames: string[] = [];
  let alertDayText = 'Tomorrow';
  
  if (plans && menus && prepForecast) {
    const todayStr = getISTDateString();
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = getISTDateString(tmrw);
    
    const checkDay = (dateStr: string, dayKey: 'today' | 'tomorrow') => {
      let missingInDay = false;
      plans.forEach(plan => {
        const planKey = `${plan.diet_type.toUpperCase()} ${plan.slot_name.toUpperCase()}`;
        const customers = (prepForecast[dayKey].breakdown as any)[planKey] || 0;
        if (customers === 0) return;
        
        const hasMenu = menus.some(m => m.subscription_id === plan.id && m.effective_date === dateStr);
        if (!hasMenu) {
          missingMenusAlert = true;
          missingInDay = true;
          if (!missingPlanNames.includes(planKey)) missingPlanNames.push(planKey);
        }
      });
      return missingInDay;
    };

    // Prioritize alerting for TODAY if they are actively missing a menu for today's prep
    const missingToday = checkDay(todayStr, 'today');
    if (missingToday) {
      alertDayText = 'Today';
    } else {
      checkDay(tmrwStr, 'tomorrow');
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B6B" style={{ marginBottom: 16 }} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#667085' }}>Connecting to Kitchen...</Text>
      </View>
    );
  }

  // --- ONBOARDING VIEW ---
  if (!kitchen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Welcome to Vindu</Text>
            <Text style={styles.subtitle}>Let&apos;s set up your kitchen profile to get started.</Text>
          </View>
          
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dispatch Phone Number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" placeholderTextColor="#98A2B3" keyboardType="phone-pad" maxLength={15} />
              <Text style={styles.helpText}>Drivers will call this number if they cannot find your kitchen.</Text>
            </View>
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- DASHBOARD VIEW ---
  if (isPlansLoading || isMenusLoading || isForecastLoading || isHolidaysLoading || isRatingsLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF6B6B" style={{ marginBottom: 16 }} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#667085' }}>Syncing Operations Matrix...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.dashboardContainer}>
        {(() => {
          if (!plans || plans.length === 0) return null;
          
          const todayStr = getISTDateString();
          const days = ['sun','mon','tue','wed','thu','fri','sat'];
          const todayShort = days[currentTime.getDay()];
          
          // Check if today is a holiday
          const isHolidayToday = holidays?.some(h => h.holiday_date === todayStr);
          if (isHolidayToday) return null;
          
          let nearestPlan: any = null;
          let minDiffMs = Infinity;
          
          plans.forEach(plan => {
            if (plan.operating_days && !plan.operating_days.includes(todayShort)) return;
            if (!plan.slot_target_time) return;
            
            const [h, m, s] = plan.slot_target_time.split(':').map(Number);
            const targetTime = new Date(currentTime);
            targetTime.setHours(h, m, s, 0);
            
            const diffMs = targetTime.getTime() - currentTime.getTime();
            
            // If the deadline is in the future, but within 12 hours
            if (diffMs > 0 && diffMs < 12 * 60 * 60 * 1000) {
              if (diffMs < minDiffMs) {
                minDiffMs = diffMs;
                nearestPlan = { ...plan, diffMs, targetTime };
              }
            }
          });
          
          if (!nearestPlan) return null;
          
          const hoursLeft = Math.floor(nearestPlan.diffMs / (1000 * 60 * 60));
          const minsLeft = Math.floor((nearestPlan.diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          const isUrgent = hoursLeft < 2;
          
          return (
            <View style={{ backgroundColor: isUrgent ? '#FEF2F2' : '#F0FDF4', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: isUrgent ? '#FCA5A5' : '#86EFAC', flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 28, marginRight: 12 }}>{isUrgent ? '🔥' : '⏱️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isUrgent ? '#DC2626' : '#16A34A', textTransform: 'uppercase' }}>Next Dispatch: {nearestPlan.diet_type} {nearestPlan.slot_name}</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: isUrgent ? '#991B1B' : '#14532D', marginTop: 2 }}>
                  {hoursLeft > 0 ? `${hoursLeft}h ` : ''}{minsLeft}m remaining
                </Text>
                <Text style={{ fontSize: 13, color: isUrgent ? '#B91C1C' : '#15803D', marginTop: 2 }}>Target: {nearestPlan.targetTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
              </View>
            </View>
          );
        })()}
        
        <View style={styles.dashboardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dashboardGreeting}>Hello,</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.dashboardTitle}>{kitchen.name}</Text>
              <TouchableOpacity onPress={() => {
                setName(kitchen.name);
                setAddress(kitchen.address);
                setFssai(kitchen.fssai_number);
                setRadius(String(kitchen.delivery_radius_km || '5'));
                setEditProfileModal(true);
              }} style={{ marginLeft: 8, padding: 4 }}>
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </TouchableOpacity>
            </View>
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
              <Text style={styles.missingMenuTitle}>Action Required for {alertDayText}!</Text>
              <Text style={styles.missingMenuText}>You have not published a menu for {alertDayText.toLowerCase()} for: {missingPlanNames.join(', ')}</Text>
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

        <Text style={styles.infoTitle}>📊 Today&apos;s Prep</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Meals</Text>
            {isForecastLoading ? <ActivityIndicator size="small" color="#FF6B6B" /> : <Text style={styles.statValue}>{prepForecast?.today.total || 0}</Text>}
            <Text style={styles.statSub}>To be cooked</Text>
            {prepForecast?.today.breakdown && Object.keys(prepForecast.today.breakdown).length > 0 && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 12 }}>
                {Object.entries(prepForecast.today.breakdown).map(([key, qty]) => (
                  <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#667085' }}>{key}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#344054' }}>{qty as number}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Tomorrow</Text>
            {isForecastLoading ? <ActivityIndicator size="small" color="#FF6B6B" /> : <Text style={styles.statValue}>{prepForecast?.tomorrow.total || 0}</Text>}
            <Text style={styles.statSub}>Projected meals</Text>
            {prepForecast?.tomorrow.breakdown && Object.keys(prepForecast.tomorrow.breakdown).length > 0 && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#F2F4F7', paddingTop: 12 }}>
                {Object.entries(prepForecast.tomorrow.breakdown).map(([key, qty]) => (
                  <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#667085' }}>{key}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#344054' }}>{qty as number}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.infoCard}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
            <Text style={[styles.infoTitle, {marginBottom: 0}]}>Customer Feedback</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF9C3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12}}>
              <Text style={{fontSize: 16}}>⭐</Text>
              <Text style={{fontWeight: '800', color: '#854D0E', marginLeft: 4}}>{ratingsData?.avg || 'New'}</Text>
            </View>
          </View>
          
          {ratingsData?.reviews && ratingsData.reviews.length > 0 ? (
            <View style={{gap: 12, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 16}}>
              {ratingsData.reviews.map((r: any, idx: number) => (
                <View key={idx} style={{backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                    <Text style={{fontSize: 12, fontWeight: '700', color: '#374151'}}>{r.profiles?.full_name || 'Customer'}</Text>
                    <Text style={{fontSize: 12, color: '#9CA3AF'}}>{new Date(r.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={{fontSize: 13, color: '#4B5563', fontStyle: 'italic'}}>&quot;{r.review_text}&quot;</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6'}}>No written reviews yet.</Text>
          )}

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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Edit Profile Modal */}
      <Modal visible={editProfileModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EAECF0', backgroundColor: '#FFF' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#101828' }}>Edit Kitchen Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileModal(false)}>
                <Text style={{ fontSize: 16, color: '#667085', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100, backgroundColor: '#FFF' }}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Kitchen Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your Brand Name" placeholderTextColor="#98A2B3" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Dispatch Phone Number</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" placeholderTextColor="#98A2B3" keyboardType="phone-pad" maxLength={15} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>FSSAI License Number</Text>
                <TextInput style={styles.input} value={fssai} onChangeText={setFssai} placeholder="14-digit license number" placeholderTextColor="#98A2B3" keyboardType="number-pad" maxLength={14} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Delivery Radius (km)</Text>
                <TextInput style={styles.input} value={radius} onChangeText={setRadius} placeholder="e.g. 5" placeholderTextColor="#98A2B3" keyboardType="number-pad" maxLength={2} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pickup Address</Text>
                <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={address} onChangeText={setAddress} placeholder="Full address for drivers" placeholderTextColor="#98A2B3" multiline />
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={() => updateKitchen.mutate()} disabled={updateKitchen.isPending}>
                {updateKitchen.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
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
