import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Switch } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// Helper to get local date string YYYY-MM-DD instead of UTC
const getLocalISODate = (d: Date) => {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const generateDays = () => {
  const days = [];
  for (let i = -3; i <= 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      dateStr: getLocalISODate(d),
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: i === 0,
      isPast: i < 0
    });
  }
  return days;
};

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default function VendorMenuPlanner() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const daysWindow = generateDays();
  const todayStr = getLocalISODate(new Date());

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<string[]>(['']);
  const [menuNotes, setMenuNotes] = useState('');

  const [autofillModalVisible, setAutofillModalVisible] = useState(false);
  const [selectedAutofillPlans, setSelectedAutofillPlans] = useState<Record<string, boolean>>({});

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: 3 * 70, animated: true });
    }, 100);
  }, []);

  const { data: kitchen, isLoading: kLoading } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: plans, isLoading: pLoading } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      // We must fetch ALL plans (even cancelled) so we can display their historical menus.
      const { data } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id);
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  const { data: menus, isLoading: mLoading } = useQuery({
    queryKey: ['vendor-menus', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return [];
      const { data } = await supabase
        .from('menus')
        .select('*')
        .in('subscription_id', plans.map(p => p.id))
        .gte('effective_date', daysWindow[0].dateStr)
        .lte('effective_date', daysWindow[daysWindow.length - 1].dateStr);
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
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one menu item.");
      if (filteredItems.length > 10) throw new Error("Maximum 10 items allowed per menu.");

      if (editingMenuId) {
        const { error } = await supabase.from('menus').update({ items: filteredItems, notes: menuNotes }).eq('id', editingMenuId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('menus').insert([{
          subscription_id: editingPlanId,
          effective_date: selectedDate,
          items: filteredItems,
          notes: menuNotes,
          status: 'active'
        }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setModalVisible(false);
      setMenuNotes('');
      queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
    },
    onError: (err: any) => Alert.alert('Error', err.message)
  });

  const deleteMenu = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('menus').delete().eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] }),
    onError: (err: any) => Alert.alert('Error', err.message)
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
            // Smart Fallback: If no menu exactly 7 days ago, grab the most recent one for this plan
            const historicalMenus = menus
              .filter(m => m.subscription_id === plan.id && m.effective_date < targetStr)
              .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
            
            if (historicalMenus.length > 0) {
              pastMenuToCopy = historicalMenus[0];
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

      if (inserts.length === 0) throw new Error("Could not find past menus to copy for the selected plans, or they are already planned/inactive.");

      const { error } = await supabase.from('menus').insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: (count) => {
      setAutofillModalVisible(false);
      if (count) {
        Alert.alert('Success', `Autofilled ${count} menus for the upcoming week!`);
        queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
      }
    },
    onError: (err: any) => Alert.alert('Autofill Status', err.message)
  });

  const handlePlanMeal = (planId: string) => {
    setEditingPlanId(planId);
    setEditingMenuId(null);
    setMenuItems(['']);
    setMenuNotes('');
    setModalVisible(true);
  };

  const handleEditMeal = (menu: any) => {
    const openModal = () => {
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

  const copyPreviousMenu = () => {
    if (!editingPlanId || !menus) return;
    const selectedDateObj = new Date(selectedDate);
    selectedDateObj.setDate(selectedDateObj.getDate() - 7);
    const lastWeekStr = getLocalISODate(selectedDateObj);
    const lastWeekDayName = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    
    const lastWeekMenu = menus.find(m => m.subscription_id === editingPlanId && m.effective_date === lastWeekStr);
    
    if (lastWeekMenu) {
      setMenuItems(lastWeekMenu.items);
      setMenuNotes(lastWeekMenu.notes || '');
    } else {
      const pastMenus = menus
        .filter(m => m.subscription_id === editingPlanId && m.effective_date < selectedDate)
        .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
        
      if (pastMenus.length > 0) {
        setMenuItems(pastMenus[0].items);
        setMenuNotes(pastMenus[0].notes || '');
        Alert.alert(
          'Notice', 
          `We didn't find a menu for last ${lastWeekDayName}, so we copied your most recent menu instead.`
        );
      } else {
        Alert.alert('No History', 'There are no past menus to copy from.');
      }
    }
  };

  const selectedDateObj = new Date(selectedDate);
  const displayDate = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const displayDayNameFull = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const selectedDayStr = SHORT_DAYS[selectedDateObj.getDay()];
  const isSelectedPast = selectedDate < todayStr;
  const isHoliday = holidays?.find(h => h.holiday_date === selectedDate);

  const updateItem = (index: number, val: string) => {
    const newArr = [...menuItems]; newArr[index] = val; setMenuItems(newArr);
  };
  const removeItem = (index: number) => {
    const newArr = menuItems.filter((_, i) => i !== index); setMenuItems(newArr.length ? newArr : ['']);
  };
  
  const toggleAutofillPlan = (planId: string) => {
    setSelectedAutofillPlans(prev => ({ ...prev, [planId]: !prev[planId] }));
  };

  if (kLoading || pLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF6B6B" /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Planner</Text>
        <TouchableOpacity style={styles.autofillBtn} onPress={() => setAutofillModalVisible(true)}>
          <Text style={styles.autofillBtnText}>🪄 Autofill Week</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarContainer}>
        <ScrollView ref={scrollViewRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarScroll}>
          {daysWindow.map((day) => {
            const isSelected = selectedDate === day.dateStr;
            return (
              <TouchableOpacity 
                key={day.dateStr} 
                style={[styles.dayCard, isSelected && styles.dayCardActive, day.isPast && !isSelected && { opacity: 0.5 }]} 
                onPress={() => setSelectedDate(day.dateStr)}
              >
                <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{day.dayName}</Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>{day.dayNum}</Text>
                {day.isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.dateHeading}>{isSelectedPast ? 'Historical Menu' : 'Plan for'} {displayDate}</Text>

        {isHoliday ? (
          <View style={styles.holidayState}>
            <Text style={styles.holidayEmoji}>🏖️</Text>
            <Text style={styles.holidayTitle}>Kitchen Closed</Text>
            <Text style={styles.holidaySub}>You marked this day as a holiday ({isHoliday.reason}). Customers will not expect meals.</Text>
          </View>
        ) : !plans || plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Active Plans</Text>
            <Text style={styles.emptySub}>Create a meal plan first (like "Veg Lunch") before you can schedule a daily menu.</Text>
          </View>
        ) : (
          (() => {
            const visiblePlans = plans.filter(plan => {
              const hasMenu = menus?.some(m => m.subscription_id === plan.id && m.effective_date === selectedDate);
              if (isSelectedPast) return hasMenu;
              return plan.status === 'active';
            });

            const operatingPlans = visiblePlans.filter(p => p.operating_days ? p.operating_days.includes(selectedDayStr) : true);
            const inactivePlans = visiblePlans.filter(p => p.operating_days ? !p.operating_days.includes(selectedDayStr) : false);

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
                        <TouchableOpacity style={styles.editBtn} onPress={() => handleEditMeal(planMenu)}>
                          <Text style={styles.editBtnText}>✏️ Edit Menu</Text>
                        </TouchableOpacity>
                        
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
                      <TouchableOpacity style={styles.planActionBtn} onPress={() => handlePlanMeal(plan.id)}>
                        <Text style={styles.planActionText}>+ Plan this meal</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.pastUnplannedText}>No menu was published for this day.</Text>
                    )}
                  </View>
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
              </View>
            );
          })()
        )}
      </ScrollView>

      {/* PLAN MENU MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>{editingMenuId ? 'Edit Menu' : 'Plan Menu'}</Text>
            <Text style={styles.modalSub}>{displayDate}</Text>
          </View>
          <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeBtn}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContainer}>
          <View style={styles.itemsHeaderRow}>
            <Text style={styles.label}>Menu Items</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={copyPreviousMenu} style={styles.copyBtnWrap}><Text style={styles.copyLink}>📋 Copy Previous</Text></TouchableOpacity>
              {menuItems.length < 10 && (
                <TouchableOpacity onPress={() => setMenuItems([...menuItems, ''])} style={styles.addBtnWrap}><Text style={styles.addItemLink}>+ Add Dish</Text></TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.itemsBlock}>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.inputRow}>
                <TextInput style={[styles.input, {flex: 1}]} value={item} onChangeText={(val) => updateItem(index, val)} placeholder="e.g. Kadai Paneer" placeholderTextColor="#9CA3AF" autoFocus={index === 0 && !editingMenuId} />
                <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          <Text style={styles.label}>Chef's Note (Optional)</Text>
          <TextInput 
            style={[styles.input, { marginBottom: 24, marginTop: 12 }]} 
            value={menuNotes} 
            onChangeText={setMenuNotes} 
            placeholder="e.g. Warning: Contains Peanuts" 
            placeholderTextColor="#9CA3AF" 
          />

          <TouchableOpacity style={styles.saveBtn} onPress={() => submitMenu.mutate()} disabled={submitMenu.isPending}>
            {submitMenu.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>{editingMenuId ? 'Save Changes' : 'Publish Menu'}</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>

      {/* AUTOFILL CONFIG MODAL */}
      <Modal visible={autofillModalVisible} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Autofill Settings</Text>
            <Text style={styles.overlaySub}>Select which plans you want to automatically roll over from last week.</Text>
            
            <View style={styles.switchesContainer}>
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
            </View>

            <View style={styles.overlayActionRow}>
              <TouchableOpacity style={styles.overlayCancelBtn} onPress={() => setAutofillModalVisible(false)}>
                <Text style={styles.overlayCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.overlayConfirmBtn} onPress={() => autofillWeek.mutate()} disabled={autofillWeek.isPending}>
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
  
  emptyState: { alignItems: 'center', padding: 40, backgroundColor: '#FFF', borderRadius: 24 },
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
