import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Switch, RefreshControl, Vibration, LayoutAnimation, UIManager, Platform, KeyboardAvoidingView } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'expo-router';

// Helper to get local date string YYYY-MM-DD instead of UTC
const getLocalISODate = (d: Date) => {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const generateMonthGrid = (targetDate: Date) => {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const days = [];
  const startOffset = firstDay.getDay(); 
  
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
  }
  
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  
  const remaining = days.length % 7;
  if (remaining !== 0) {
    for (let i = 1; i <= 7 - remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
  }
  
  return days.map(d => ({
    dateStr: getLocalISODate(d.date),
    dayNum: d.date.getDate(),
    dayName: d.date.toLocaleDateString('en-US', { weekday: 'short' }),
    isCurrentMonth: d.isCurrentMonth
  }));
};

const generateDays = (anchorDateStr: string) => {
  const days = [];
  const anchor = parseLocalDate(anchorDateStr);
  const todayStr = getLocalISODate(new Date());

  for (let i = -3; i <= 10; i++) {
    // Construct each day by adding to year/month/date integers, not by mutating
    // a Date object. This prevents DST-transition days from shifting by ±1 hour
    // and causing getDate() to return the wrong value near midnight boundaries.
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i);
    const dStr = getLocalISODate(d);
    
    days.push({
      dateStr: dStr,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: dStr === todayStr,
      isPast: dStr < todayStr
    });
  }
  return days;
};

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function VendorMenuPlanner() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const todayStr = getLocalISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const daysWindow = generateDays(selectedDate);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const monthGrid = generateMonthGrid(calendarMonth);

  useEffect(() => {
    const d = parseLocalDate(selectedDate);
    if (d.getMonth() !== calendarMonth.getMonth() || d.getFullYear() !== calendarMonth.getFullYear()) {
      setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [selectedDate]);

  const [modalVisible, setModalVisible] = useState(false);
  const [monthModalVisible, setMonthModalVisible] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<string[]>(['']);
  const [menuNotes, setMenuNotes] = useState('');

  const [autofillModalVisible, setAutofillModalVisible] = useState(false);
  const [selectedAutofillPlans, setSelectedAutofillPlans] = useState<Record<string, boolean>>({});
  const [focusedInputIndex, setFocusedInputIndex] = useState<number | null>(null);

  const selectSuggestion = (index: number, suggestion: string) => {
    Vibration.vibrate(50);
    updateItem(index, suggestion);
    if (index === menuItems.length - 1 && index < 9) addItem();
  };

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: 3 * 70, animated: true });
    }, 50);
  }, [selectedDate]);

  const { data: kitchen, isLoading: kLoading, isError: kError } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: plans, isLoading: pLoading, isError: pError } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      // We must fetch ALL plans (even cancelled) so we can display their historical menus.
      const { data } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id);
      return data || [];
    },
    enabled: !!kitchen?.id,
  });
  const { data: dishHistory } = useQuery({
    queryKey: ['vendor-dish-history', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('menus').select('menu_items').eq('kitchen_id', kitchen?.id);
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach(m => {
        (m.menu_items || []).forEach((d: string) => {
          const clean = d.trim();
          if (clean) counts[clean] = (counts[clean] || 0) + 1;
        });
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(e => e[0]);
    },
    enabled: !!kitchen?.id
  });

  const { data: menus, isLoading: mLoading, isError: mError } = useQuery({
    queryKey: ['vendor-menus', kitchen?.id, calendarMonth.getFullYear(), calendarMonth.getMonth()],
    queryFn: async () => {
      if (!plans || plans.length === 0) return [];
      
      const anchor = parseLocalDate(selectedDate);
      const stripStart = new Date(anchor); stripStart.setDate(stripStart.getDate() - 3);
      const stripEnd = new Date(anchor); stripEnd.setDate(stripEnd.getDate() + 10);
      
      const gridStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      const gridEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);

      const minDate = new Date(Math.min(stripStart.getTime(), gridStart.getTime()));
      minDate.setDate(minDate.getDate() - 7); 

      const maxDate = new Date(Math.max(stripEnd.getTime(), gridEnd.getTime()));
      maxDate.setDate(maxDate.getDate() + 7);

      const { data } = await supabase
        .from('menus')
        .select('*')
        .in('subscription_id', plans.map(p => p.id))
        .gte('effective_date', getLocalISODate(minDate))
        .lte('effective_date', getLocalISODate(maxDate));
      return data || [];
    },
    enabled: !!plans && plans.length > 0,
  });

  const { data: holidays } = useQuery({
    queryKey: ['vendor-holidays', kitchen?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchen_holidays').select('*').eq('kitchen_id', kitchen?.id);
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  useEffect(() => {
    if (plans && Object.keys(selectedAutofillPlans).length === 0) {
      const defaultSelection: Record<string, boolean> = {};
      plans.forEach(p => defaultSelection[p.id] = true);
      setSelectedAutofillPlans(defaultSelection);
    }
  }, [plans]);

  const submitMenu = useMutation({
    mutationFn: async () => {
      const filteredItems = menuItems.map(item => item.trim()).filter(item => item !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one menu item.");
      if (filteredItems.length > 10) throw new Error("Maximum 10 items allowed per menu.");

      const payload: any = {
        subscription_id: editingPlanId,
        effective_date: selectedDate,
        items: filteredItems,
        notes: menuNotes.trim() || null,
        status: 'active'
      };
      
      if (editingMenuId) payload.id = editingMenuId;

      const { error } = await supabase.from('menus').upsert([payload], {
        onConflict: 'subscription_id,effective_date'
      });
      
      if (error) throw new Error(error.message);
    },
    onMutate: async () => {
      const filteredItems = menuItems.map(item => item.trim()).filter(item => item !== '');
      if (filteredItems.length === 0) return;
      
      const queryKey = ['vendor-menus', kitchen?.id, calendarMonth.getFullYear(), calendarMonth.getMonth()];
      await queryClient.cancelQueries({ queryKey });
      const previousMenus = queryClient.getQueryData(queryKey);

      const optimisticMenu = {
        id: editingMenuId || `temp-${Date.now()}`,
        subscription_id: editingPlanId,
        effective_date: selectedDate,
        items: filteredItems,
        notes: menuNotes.trim() || null,
        status: 'active'
      };

      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return [optimisticMenu];
        const exists = old.findIndex((m: any) => (m.subscription_id === editingPlanId && m.effective_date === selectedDate) || m.id === optimisticMenu.id);
        if (exists >= 0) {
          const next = [...old];
          next[exists] = optimisticMenu;
          return next;
        }
        return [...old, optimisticMenu];
      });
      
      setModalVisible(false);
      setMenuNotes('');
      return { previousMenus, queryKey };
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousMenus) queryClient.setQueryData(context.queryKey, context.previousMenus);
      Alert.alert('Error', err.message);
      setModalVisible(true);
    },
    onSettled: (data, error, variables, context: any) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey });
    }
  });

  const deleteMenu = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('menus').delete().eq('id', id);
    },
    onMutate: async (id: string) => {
      const queryKey = ['vendor-menus', kitchen?.id, calendarMonth.getFullYear(), calendarMonth.getMonth()];
      await queryClient.cancelQueries({ queryKey });
      const previousMenus = queryClient.getQueryData(queryKey);
      
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return [];
        return old.filter((m: any) => m.id !== id);
      });
      return { previousMenus, queryKey };
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previousMenus) queryClient.setQueryData(context.queryKey, context.previousMenus);
      Alert.alert('Error', err.message);
    },
    onSettled: (data, error, variables, context: any) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey });
    }
  });

  const autofillWeek = useMutation({
    mutationFn: async () => {
      if (!plans || plans.length === 0 || !menus) return;
      const inserts = [];
      const todayObj = new Date(todayStr);

      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(todayObj); targetDate.setDate(targetDate.getDate() + i);
        const targetStr = getLocalISODate(targetDate);
        const pastDate = new Date(targetDate); pastDate.setDate(pastDate.getDate() - 7);
        const pastStr = getLocalISODate(pastDate);
        const targetDayStr = SHORT_DAYS[targetDate.getDay()];

        if (holidays?.find(h => h.holiday_date === targetStr)) continue;

        for (const plan of plans) {
          if (!selectedAutofillPlans[plan.id]) continue;
          
          // CRITICAL: Do not autofill on days the plan is not operating
          if (plan.operating_days && !plan.operating_days.includes(targetDayStr)) continue;

          const existingTarget = menus.find(m => m.subscription_id === plan.id && m.effective_date === targetStr);
          if (existingTarget) continue;

          let pastMenuToCopy = menus.find(m => m.subscription_id === plan.id && m.effective_date === pastStr);
          
          if (!pastMenuToCopy) {
            // Smart Fallback 1: Local cache search
            const historicalMenus = menus
              .filter(m => m.subscription_id === plan.id && m.effective_date < targetStr)
              .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
            
            if (historicalMenus.length > 0) {
              pastMenuToCopy = historicalMenus[0];
            } else {
              // Smart Fallback 2: Deep Server Scan (if vendor hasn't logged in for months)
              const { data: deepScan } = await supabase
                .from('menus')
                .select('*')
                .eq('subscription_id', plan.id)
                .lt('effective_date', targetStr)
                .order('effective_date', { ascending: false })
                .limit(1)
                .single();
              
              if (deepScan) {
                pastMenuToCopy = deepScan;
              }
            }
          }

          if (pastMenuToCopy) {
            inserts.push({
              subscription_id: plan.id,
              effective_date: targetStr,
              items: pastMenuToCopy.items,
              notes: pastMenuToCopy.notes || null,
              status: 'active'
            });
          }
        }
      }

      if (inserts.length === 0) {
        return { count: 0, reason: "already_planned" };
      }

      const { error } = await supabase.from('menus').insert(inserts);
      if (error) throw error;
      return { count: inserts.length };
    },
    onSuccess: (result: any) => {
      setAutofillModalVisible(false);
      if (result?.count === 0) {
        Alert.alert('All Set!', 'Your selected plans are already fully planned for the upcoming week.');
      } else if (result?.count > 0) {
        Alert.alert('Success', `Autofilled ${result.count} menus for the upcoming week!`);
        queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
      }
    },
    onError: (err: any) => Alert.alert('Autofill Status', err.message)
  });

  const handlePlanMeal = (planId: string) => {
    Vibration.vibrate(50);
    setEditingPlanId(planId);
    setEditingMenuId(null);
    setMenuItems(['']);
    setMenuNotes('');
    setModalVisible(true);
  };

  const handleEditMeal = (menu: any) => {
    const openModal = () => {
      Vibration.vibrate(50);
      setEditingPlanId(menu.subscription_id);
      setEditingMenuId(menu.id);
      setMenuItems([...menu.items]);
      setMenuNotes(menu.notes || '');
      setModalVisible(true);
    };

    if (selectedDate === todayStr) {
      Alert.alert(
        'Edit Today\'s Menu?',
        'Customers may have already seen this menu or placed orders based on it. Changing it now could lead to disputes. Are you sure you want to proceed?',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Proceed', onPress: openModal, style: 'destructive' }]
      );
    } else {
      openModal();
    }
  };

  const copyPreviousMenu = async () => {
    if (!editingPlanId || !menus) return;
    const selectedDateObj = parseLocalDate(selectedDate);
    selectedDateObj.setDate(selectedDateObj.getDate() - 7);
    const lastWeekStr = getLocalISODate(selectedDateObj);
    const lastWeekDayName = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    
    const lastWeekMenu = menus.find(m => m.subscription_id === editingPlanId && m.effective_date === lastWeekStr);
    
    if (lastWeekMenu) {
      Vibration.vibrate(50);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMenuItems(lastWeekMenu.items);
      setMenuNotes(lastWeekMenu.notes || '');
    } else {
      const pastMenus = menus
        .filter(m => m.subscription_id === editingPlanId && m.effective_date < selectedDate)
        .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
        
      if (pastMenus.length > 0) {
        Vibration.vibrate(50);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMenuItems(pastMenus[0].items);
        setMenuNotes(pastMenus[0].notes || '');
        Alert.alert(
          'Notice', 
          `We didn't find a menu for last ${lastWeekDayName}, so we copied your most recent menu instead.`
        );
      } else {
        const { data: deepScan } = await supabase
          .from('menus')
          .select('*')
          .eq('subscription_id', editingPlanId)
          .lt('effective_date', selectedDate)
          .order('effective_date', { ascending: false })
          .limit(1)
          .single();
          
        if (deepScan) {
          Vibration.vibrate(50);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMenuItems(deepScan.items);
          setMenuNotes(deepScan.notes || '');
          Alert.alert('Notice', 'We searched your deep archives and copied your most recent menu.');
        } else {
          Alert.alert('No History', 'There are no past menus to copy from.');
        }
      }
    }
  };

  const selectedDateObj = parseLocalDate(selectedDate);
  const displayDate = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const displayDayNameFull = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const selectedDayStr = SHORT_DAYS[selectedDateObj.getDay()];
  const isSelectedPast = selectedDate < todayStr;
  const isHoliday = holidays?.find(h => h.holiday_date === selectedDate);

  const updateItem = (index: number, val: string) => {
    const newArr = [...menuItems]; newArr[index] = val; setMenuItems(newArr);
  };
  
  const addItem = () => {
    if (menuItems.length < 10) {
      Vibration.vibrate(50);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMenuItems([...menuItems, '']);
    }
  };

  const removeItem = (index: number) => {
    Vibration.vibrate(50);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newArr = menuItems.filter((_, i) => i !== index); 
    setMenuItems(newArr.length ? newArr : ['']);
  };
  
  const toggleAutofillPlan = (planId: string) => {
    setSelectedAutofillPlans(prev => ({ ...prev, [planId]: !prev[planId] }));
  };

  const getDayStatus = (dateStr: string, dayStrShort: string) => {
    if (holidays?.find(h => h.holiday_date === dateStr)) return 'holiday';
    if (!plans || plans.length === 0) return 'empty';
    if (dateStr < todayStr) return 'past';

    const activePlans = plans.filter(p => p.status === 'active');
    const operatingPlans = activePlans.filter(p => p.operating_days ? p.operating_days.includes(dayStrShort) : true);
    
    if (operatingPlans.length === 0) return 'inactive';

    const menusPublished = menus?.filter(m => m.effective_date === dateStr).length || 0;

    if (menusPublished === 0) return 'unplanned';
    if (menusPublished < operatingPlans.length) return 'partial';
    return 'planned';
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['vendor-plans', kitchen?.id] }),
      queryClient.refetchQueries({ queryKey: ['vendor-menus', kitchen?.id] })
    ]);
    setRefreshing(false);
  }, [kitchen?.id, queryClient]);

  if (kLoading || pLoading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#FF6B6B" style={{ marginBottom: 16 }} />
      <Text style={{ fontSize: 15, fontWeight: '600', color: '#667085' }}>Syncing Kitchen Data...</Text>
    </View>
  );

  if (kError || pError || mError) return (
    <View style={styles.center}>
      <Text style={{ fontSize: 40, marginBottom: 16 }}>📶</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#101828', marginBottom: 8 }}>Connection Lost</Text>
      <Text style={{ fontSize: 14, color: '#667085', textAlign: 'center', paddingHorizontal: 40 }}>We couldn't reach the servers. Please check your internet connection.</Text>
      <TouchableOpacity onPress={onRefresh} style={{ marginTop: 24, backgroundColor: '#101828', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
        <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry Connection</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Text style={styles.title}>Planner</Text>
            <TouchableOpacity onPress={() => setMonthModalVisible(true)} style={{padding: 6, backgroundColor: '#F9FAFB', borderRadius: 8}}>
              <Text style={{fontSize: 16}}>📅</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: '#667085', fontWeight: '500', marginTop: 4 }}>
            {parseLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        {plans && plans.some(p => p.status === 'active') && (
          <TouchableOpacity style={styles.autofillBtn} onPress={() => {
            const all: Record<string, boolean> = {};
            plans?.filter(p => p.status === 'active').forEach(p => all[p.id] = true);
            setSelectedAutofillPlans(all);
            setAutofillModalVisible(true);
          }}>
            <Text style={styles.autofillBtnText}>🪄 Autofill Week</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.calendarContainer}>
        <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {daysWindow.map((day) => {
            const isSelected = selectedDate === day.dateStr;
            const dayStatus = getDayStatus(day.dateStr, day.dayName.toLowerCase());

            return (
              <TouchableOpacity 
                key={day.dateStr} 
                style={[styles.dayCard, isSelected && styles.dayCardActive, day.isPast && !isSelected && { opacity: 0.5 }]} 
                onPress={() => { Vibration.vibrate(50); setSelectedDate(day.dateStr); }}
              >
                <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{day.dayName}</Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>{day.dayNum}</Text>
                
                <View style={styles.statusIndicatorRow}>
                  {dayStatus === 'holiday' && <Text style={styles.statusEmoji}>🏖️</Text>}
                  {dayStatus === 'unplanned' && <View style={[styles.dot, {backgroundColor: '#DC2626'}]} />}
                  {dayStatus === 'partial' && <View style={[styles.dot, {backgroundColor: '#F59E0B'}]} />}
                  {dayStatus === 'planned' && <View style={[styles.dot, {backgroundColor: '#10B981'}]} />}
                </View>

                {day.isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView 
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B6B" />}
      >
        <Text style={styles.dateHeading}>{isSelectedPast ? 'Historical Menu' : 'Plan for'} {displayDate}</Text>

        {isHoliday && (
          <View style={[styles.holidayState, { marginBottom: 24 }]}>
            <Text style={styles.holidayEmoji}>🏖️</Text>
            <Text style={styles.holidayTitle}>Kitchen Closed</Text>
            <Text style={styles.holidaySub}>You marked this day as a holiday ({isHoliday.reason}). Customers will not expect meals.</Text>
          </View>
        )}

        {!plans || plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Active Plans</Text>
            <Text style={styles.emptySub}>Create a meal plan first (like "Veg Lunch") before you can schedule a daily menu.</Text>
            <TouchableOpacity style={{marginTop: 24, backgroundColor: '#101828', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12}} onPress={() => router.push('/(vendor)/plans')}>
              <Text style={{color: '#FFF', fontWeight: '700', fontSize: 14}}>Go to Plans</Text>
            </TouchableOpacity>
          </View>
        ) : (
          (() => {
            const visiblePlans = plans.filter(plan => {
              const hasMenu = menus?.some(m => m.subscription_id === plan.id && m.effective_date === selectedDate);
              if (isSelectedPast) return hasMenu;
              return true; // For future days, show all plans (active + cancelled) so they can fulfill lingering subscriptions
            });

            const activeVisiblePlans = visiblePlans.filter(p => p.status === 'active');
            const cancelledPlans = visiblePlans.filter(p => p.status === 'cancelled');

            const operatingPlans = activeVisiblePlans.filter(p => p.operating_days ? p.operating_days.includes(selectedDayStr) : true);
            const inactivePlans = activeVisiblePlans.filter(p => p.operating_days ? !p.operating_days.includes(selectedDayStr) : false);

            return (
              <View>
                {operatingPlans.map(plan => {
                  const planMenu = menus?.find(m => m.subscription_id === plan.id && m.effective_date === selectedDate);
                  const isPlanned = !!planMenu;

            return (
              <View key={plan.id} style={[styles.planCard, isPlanned ? styles.cardPlanned : styles.cardUnplanned]}>
                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>{plan.diet_type.toUpperCase()} {plan.slot_name.toUpperCase()}</Text>
                  <View style={[styles.statusBadge, isPlanned ? styles.badgePlanned : styles.badgeUnplanned]}>
                    <Text style={[styles.statusText, isPlanned ? styles.statusTextPlanned : styles.statusTextUnplanned]}>
                      {isPlanned ? '✅ Planned' : '⚠️ Not Planned'}
                    </Text>
                  </View>
                </View>

                {isPlanned ? (
                  <View style={styles.plannedContent}>
                    {planMenu.items.map((item: string, idx: number) => (
                      <View key={idx} style={styles.dishRowDisplay}>
                        <View style={styles.bullet} />
                        <Text style={styles.dishText}>{item}</Text>
                      </View>
                    ))}
                    {planMenu.notes ? (
                      <Text style={styles.notesText}>Chef's Note: {planMenu.notes}</Text>
                    ) : null}
                    {!isSelectedPast && (
                      <View style={styles.actionRow}>
                        {!isHoliday ? (
                          <TouchableOpacity style={styles.editBtn} onPress={() => handleEditMeal(planMenu)}>
                            <Text style={styles.editBtnText}>✏️ Edit Menu</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.editBtn, { opacity: 0.5 }]}>
                            <Text style={styles.editBtnText}>🔒 Kitchen Closed</Text>
                          </View>
                        )}
                        
                        {selectedDate !== todayStr && (
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => Alert.alert('Delete Menu?', 'Remove this menu?', [{text: 'Cancel'}, {text: 'Delete', style: 'destructive', onPress: () => deleteMenu.mutate(planMenu.id)}])}>
                            <Text style={styles.deleteBtnText}>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.unplannedContent}>
                    {!isSelectedPast && !isHoliday ? (
                      <TouchableOpacity style={styles.planActionBtn} onPress={() => handlePlanMeal(plan.id)}>
                        <Text style={styles.planActionText}>+ Plan this meal</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.pastUnplannedText}>No menu was published for this day.</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          
                {/* Render compact inactive summary if any */}
                {inactivePlans.length > 0 && (
                  <View style={styles.compactInactiveContainer}>
                    <Text style={styles.compactInactiveTitle}>⏸️ Inactive Plans for {displayDayNameFull}</Text>
                    {inactivePlans.map(plan => (
                      <Text key={plan.id} style={styles.compactInactiveItem}>• {plan.diet_type.toUpperCase()} {plan.slot_name.toUpperCase()}</Text>
                    ))}
                  </View>
                )}

                {/* Render cancelled plans that might need fulfillment */}
                {cancelledPlans.length > 0 && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#B91C1C', marginBottom: 12 }}>⚠️ Cancelled Plans (Fulfill Orders)</Text>
                    {cancelledPlans.map(plan => {
                      const planMenu = menus?.find(m => m.subscription_id === plan.id && m.effective_date === selectedDate);
                      const isPlanned = !!planMenu;

                      return (
                        <View key={plan.id} style={[styles.planCard, isPlanned ? styles.cardPlanned : styles.cardUnplanned, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                          <View style={styles.planHeader}>
                            <Text style={[styles.planTitle, { color: '#991B1B' }]}>{plan.diet_type.toUpperCase()} {plan.slot_name.toUpperCase()}</Text>
                            <View style={[styles.statusBadge, isPlanned ? styles.badgePlanned : styles.badgeUnplanned]}>
                              <Text style={[styles.statusText, isPlanned ? styles.statusTextPlanned : styles.statusTextUnplanned]}>
                                {isPlanned ? '✅ Planned' : '⚠️ Not Planned'}
                              </Text>
                            </View>
                          </View>

                          {isPlanned ? (
                            <View style={styles.plannedContent}>
                              {planMenu.items.map((item: string, idx: number) => (
                                <View key={idx} style={styles.dishRowDisplay}>
                                  <View style={styles.bullet} />
                                  <Text style={styles.dishText}>{item}</Text>
                                </View>
                              ))}
                              {planMenu.notes ? (
                                <Text style={styles.notesText}>Chef's Note: {planMenu.notes}</Text>
                              ) : null}
                              {!isSelectedPast && (
                                <View style={styles.actionRow}>
                                  {!isHoliday ? (
                                    <TouchableOpacity style={styles.editBtn} onPress={() => handleEditMeal(planMenu)}>
                                      <Text style={styles.editBtnText}>✏️ Edit Menu</Text>
                                    </TouchableOpacity>
                                  ) : (
                                    <View style={[styles.editBtn, { opacity: 0.5 }]}>
                                      <Text style={styles.editBtnText}>🔒 Kitchen Closed</Text>
                                    </View>
                                  )}
                                  
                                  {selectedDate !== todayStr && (
                                    <TouchableOpacity style={styles.deleteBtn} onPress={() => Alert.alert('Delete Menu?', 'Remove this menu?', [{text: 'Cancel'}, {text: 'Delete', style: 'destructive', onPress: () => deleteMenu.mutate(planMenu.id)}])}>
                                      <Text style={styles.deleteBtnText}>🗑️</Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={styles.unplannedContent}>
                              {!isSelectedPast ? (
                                <TouchableOpacity style={[styles.planActionBtn, { backgroundColor: '#DC2626' }]} onPress={() => handlePlanMeal(plan.id)}>
                                  <Text style={styles.planActionText}>+ Plan this meal</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })()
        )}
      </ScrollView>

      {/* PLAN MENU MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{editingMenuId ? 'Edit Menu' : 'Plan Menu'}</Text>
              <Text style={styles.modalSub}>
                {plans?.find(p => p.id === editingPlanId)?.diet_type.toUpperCase()}{' '}
                {plans?.find(p => p.id === editingPlanId)?.slot_name.toUpperCase()} • {displayDate}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setModalVisible(false)} disabled={submitMenu.isPending}>
              <Text style={[styles.closeBtn, submitMenu.isPending && { opacity: 0.5 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.itemsHeaderRow}>
              <Text style={styles.label}>Menu Items</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={copyPreviousMenu} style={styles.copyBtnWrap}><Text style={styles.copyLink}>📋 Copy Previous</Text></TouchableOpacity>
                {menuItems.length < 10 && (
                  <TouchableOpacity onPress={addItem} style={styles.addBtnWrap}><Text style={styles.addItemLink}>+ Add Dish</Text></TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.itemsBlock}>
              {menuItems.map((item, index) => {
                const showSuggestions = focusedInputIndex === index && dishHistory && dishHistory.length > 0;
                const filteredSuggestions = showSuggestions ? dishHistory.filter((d: string) => d.toLowerCase().includes(item.toLowerCase()) && d.toLowerCase() !== item.toLowerCase()) : [];

                return (
                  <View key={index} style={{ gap: 8 }}>
                    <View style={styles.inputRow}>
                      <TextInput 
                        style={[styles.input, {flex: 1}]} 
                        value={item} 
                        onChangeText={(val) => updateItem(index, val)} 
                        placeholder="e.g. Kadai Paneer" 
                        placeholderTextColor="#9CA3AF" 
                        maxLength={60} 
                        autoFocus={(!editingMenuId && index === 0) || (item === '' && index === menuItems.length - 1)}
                        onFocus={() => setFocusedInputIndex(index)}
                        onSubmitEditing={() => { if (index === menuItems.length - 1 && index < 9) addItem(); }}
                        blurOnSubmit={index !== menuItems.length - 1 || index === 9}
                        returnKeyType={index === menuItems.length - 1 && index < 9 ? "next" : "done"}
                      />
                      <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
                    </View>
                    
                    {filteredSuggestions.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 4 }} keyboardShouldPersistTaps="handled">
                        {filteredSuggestions.map((suggestion: string, sIdx: number) => (
                          <TouchableOpacity 
                            key={sIdx} 
                            style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 }}
                            onPress={() => selectSuggestion(index, suggestion)}
                          >
                            <Text style={{ fontSize: 13, color: '#344054', fontWeight: '500' }}>{suggestion}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <Text style={styles.label}>Chef's Note (Optional)</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: menuNotes.length >= 190 ? '#EF4444' : '#9CA3AF' }}>{menuNotes.length}/200</Text>
            </View>
            <TextInput 
              style={[styles.input, { marginBottom: 24, marginTop: 12, minHeight: 100, textAlignVertical: 'top' }]} 
              value={menuNotes} 
              onChangeText={setMenuNotes} 
              placeholder="e.g. Warning: Contains Peanuts" 
              placeholderTextColor="#9CA3AF" 
              multiline 
              maxLength={200}
            />
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.saveBtn} onPress={() => submitMenu.mutate()} disabled={submitMenu.isPending}>
              {submitMenu.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingMenuId ? 'Save Changes' : 'Publish Menu'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MONTH GRID MODAL */}
      <Modal visible={monthModalVisible} animationType="fade" transparent onRequestClose={() => setMonthModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                <TouchableOpacity onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><Text style={{fontSize: 24, color: '#101828'}}>‹</Text></TouchableOpacity>
                <Text style={styles.overlayTitle}>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><Text style={{fontSize: 24, color: '#101828'}}>›</Text></TouchableOpacity>
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                {(() => {
                  const sel = parseLocalDate(selectedDate);
                  const isCentered = calendarMonth.getMonth() === sel.getMonth() && calendarMonth.getFullYear() === sel.getFullYear();
                  if (isCentered) return null;
                  return (
                    <TouchableOpacity onPress={() => setCalendarMonth(sel)}>
                      <Text style={{color: '#FF6B6B', fontWeight: '600', fontSize: 13}}>Snap to Selected</Text>
                    </TouchableOpacity>
                  );
                })()}
                <TouchableOpacity onPress={() => setMonthModalVisible(false)}>
                  <Text style={styles.closeBtn}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={{flexDirection: 'row', marginBottom: 12}}>
              {SHORT_DAYS.map(d => <Text key={d} style={{flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#667085'}}>{d.toUpperCase()}</Text>)}
            </View>

            <View style={{flexDirection: 'row', flexWrap: 'wrap'}}>
              {monthGrid.map((day, idx) => {
                const dayStatus = getDayStatus(day.dateStr, day.dayName.toLowerCase());
                return (
                  <TouchableOpacity 
                    key={idx} 
                    style={[{width: '14.28%', aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center'}, !day.isCurrentMonth && {opacity: 0.3}]}
                    onPress={() => { Vibration.vibrate(50); setSelectedDate(day.dateStr); setMonthModalVisible(false); }}
                  >
                    <View style={[{width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'}, day.dateStr === todayStr && {backgroundColor: '#FEF2F2'}]}>
                       <Text style={[{fontSize: 14, fontWeight: '600', color: '#101828'}, day.dateStr === selectedDate && {color: '#FF6B6B', fontWeight: '800'}]}>{day.dayNum}</Text>
                       <View style={{flexDirection: 'row', position: 'absolute', bottom: 2}}>
                         {dayStatus === 'holiday' && <Text style={{fontSize: 8}}>🏖️</Text>}
                         {dayStatus === 'unplanned' && <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: '#DC2626'}} />}
                         {dayStatus === 'partial' && <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B'}} />}
                         {dayStatus === 'planned' && <View style={{width: 4, height: 4, borderRadius: 2, backgroundColor: '#10B981'}} />}
                       </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* AUTOFILL CONFIG MODAL */}
      <Modal visible={autofillModalVisible} animationType="fade" transparent onRequestClose={() => setAutofillModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Autofill Settings</Text>
            <Text style={styles.overlaySub}>Select which plans you want to automatically roll over from last week.</Text>
            
            <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginBottom: 12}}>
              <TouchableOpacity 
                onPress={() => setSelectedAutofillPlans({})}
                disabled={!Object.values(selectedAutofillPlans).some(Boolean)}
              >
                <Text style={{color: '#667085', fontWeight: '600', fontSize: 13, opacity: !Object.values(selectedAutofillPlans).some(Boolean) ? 0.3 : 1}}>Deselect All</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  const all: Record<string, boolean> = {};
                  plans?.filter(p => p.status === 'active').forEach(p => all[p.id] = true);
                  setSelectedAutofillPlans(all);
                }}
                disabled={Object.values(selectedAutofillPlans).filter(Boolean).length === (plans?.filter(p => p.status === 'active').length || 0)}
              >
                <Text style={{color: '#FF6B6B', fontWeight: '600', fontSize: 13, opacity: Object.values(selectedAutofillPlans).filter(Boolean).length === (plans?.filter(p => p.status === 'active').length || 0) ? 0.3 : 1}}>Select All</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={[styles.switchesContainer, { maxHeight: 300 }]}>
              {plans?.filter(p => p.status === 'active').map(plan => (
                <View key={plan.id} style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{plan.diet_type.toUpperCase()} {plan.slot_name.toUpperCase()}</Text>
                  <Switch 
                    value={!!selectedAutofillPlans[plan.id]} 
                    onValueChange={() => toggleAutofillPlan(plan.id)} 
                    trackColor={{ true: '#FF6B6B', false: '#EAECF0' }}
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.overlayActionRow}>
              <TouchableOpacity style={styles.overlayCancelBtn} onPress={() => setAutofillModalVisible(false)} disabled={autofillWeek.isPending}>
                <Text style={[styles.overlayCancelText, autofillWeek.isPending && { opacity: 0.5 }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.overlayConfirmBtn, !Object.values(selectedAutofillPlans).some(Boolean) && { opacity: 0.5 }]} 
                onPress={() => autofillWeek.mutate()} 
                disabled={autofillWeek.isPending || !Object.values(selectedAutofillPlans).some(Boolean)}
              >
                {autofillWeek.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.overlayConfirmText}>Run Autofill</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, backgroundColor: '#FFF' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  autofillBtn: { backgroundColor: '#101828', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  autofillBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  
  calendarContainer: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  calendarScroll: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
  dayCard: { width: 60, height: 74, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EAECF0' },
  dayCardActive: { backgroundColor: '#FF6B6B', borderColor: '#FF6B6B' },
  dayName: { fontSize: 12, fontWeight: '600', color: '#667085', marginBottom: 4 },
  dayNameActive: { color: '#FFE4E4' },
  dayNum: { fontSize: 18, fontWeight: '800', color: '#101828' },
  dayNumActive: { color: '#FFF' },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B', position: 'absolute', bottom: -10 },
  statusIndicatorRow: { flexDirection: 'row', position: 'absolute', top: 6, right: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusEmoji: { fontSize: 8 },
  
  body: { padding: 24 },
  dateHeading: { fontSize: 16, fontWeight: '700', color: '#667085', marginBottom: 20 },
  
  planCard: { borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1 },
  cardPlanned: { backgroundColor: '#FFF', borderColor: '#EAECF0', shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  cardUnplanned: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2', borderStyle: 'dashed' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  planTitle: { fontSize: 16, fontWeight: '800', color: '#101828' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgePlanned: { backgroundColor: '#ECFDF3' },
  badgeUnplanned: { backgroundColor: '#FFF' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextPlanned: { color: '#027A48' },
  statusTextUnplanned: { color: '#DC2626' },
  
  compactInactiveContainer: { padding: 16, backgroundColor: '#F9FAFB', borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginTop: 8, marginBottom: 16 },
  compactInactiveTitle: { fontSize: 13, fontWeight: '700', color: '#667085', marginBottom: 8 },
  compactInactiveItem: { fontSize: 14, fontWeight: '500', color: '#9CA3AF', marginBottom: 4, paddingLeft: 4 },
  
  plannedContent: {},
  dishRowDisplay: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B', marginRight: 12 },
  dishText: { fontSize: 15, color: '#344054', fontWeight: '500' },
  notesText: { fontSize: 13, color: '#B54708', fontWeight: '500', fontStyle: 'italic', marginTop: 8, padding: 8, backgroundColor: '#FFFAEB', borderRadius: 8 },
  
  actionRow: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F2F4F7', gap: 12 },
  editBtn: { flex: 1, backgroundColor: '#F9FAFB', paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#EAECF0' },
  editBtnText: { color: '#344054', fontWeight: '600', fontSize: 14 },
  deleteBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12 },
  deleteBtnText: { fontSize: 16 },
  
  unplannedContent: { alignItems: 'flex-start' },
  planActionBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  planActionText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  pastUnplannedText: { color: '#B91C1C', fontSize: 14, fontStyle: 'italic' },
  
  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#F9FAFB', borderRadius: 24, borderWidth: 2, borderColor: '#EAECF0', borderStyle: 'dashed' },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#667085', textAlign: 'center', lineHeight: 22 },

  holidayState: { alignItems: 'center', padding: 40, backgroundColor: '#FEF0EC', borderRadius: 24, borderWidth: 1, borderColor: '#FEE2E2' },
  holidayEmoji: { fontSize: 40, marginBottom: 16 },
  holidayTitle: { fontSize: 18, fontWeight: '700', color: '#991B1B', marginBottom: 8 },
  holidaySub: { fontSize: 14, color: '#B91C1C', textAlign: 'center', lineHeight: 22 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  modalSub: { fontSize: 13, color: '#667085', marginTop: 2, fontWeight: '500' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: '#344054' },
  copyBtnWrap: { backgroundColor: '#F0F9FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnWrap: { backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addItemLink: { color: '#FF6B6B', fontWeight: '700', fontSize: 13 },
  copyLink: { color: '#026AA2', fontWeight: '700', fontSize: 13 },
  
  itemsBlock: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24, gap: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  removeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#DC2626', fontSize: 18, fontWeight: '700' },
  
  modalFooter: { padding: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F2F4F7', backgroundColor: '#FFF' },
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
  overlayTitle: { fontSize: 20, fontWeight: '800', color: '#101828', marginBottom: 8 },
  overlaySub: { fontSize: 14, color: '#667085', marginBottom: 24, lineHeight: 20 },
  switchesContainer: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#344054' },
  overlayActionRow: { flexDirection: 'row', gap: 12 },
  overlayCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F2F4F7' },
  overlayCancelText: { fontSize: 15, fontWeight: '700', color: '#344054' },
  overlayConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#FF6B6B' },
  overlayConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
