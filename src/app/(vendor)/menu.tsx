import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert, Animated } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// Generate a 14-day window (-3 days to +10 days)
const generateDays = () => {
  const days = [];
  for (let i = -3; i <= 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      dateStr: d.toISOString().split('T')[0],
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: i === 0,
      isPast: i < 0
    });
  }
  return days;
};

export default function VendorMenuPlanner() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const daysWindow = generateDays();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<string[]>(['']);
  const [menuNotes, setMenuNotes] = useState('');

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Scroll to today on mount
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
      const { data } = await supabase.from('subscriptions').select('*').eq('kitchen_id', kitchen?.id).neq('status', 'cancelled');
      return data || [];
    },
    enabled: !!kitchen?.id,
  });

  // Fetch menus for the 14 day window
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

  const submitMenu = useMutation({
    mutationFn: async () => {
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one menu item.");

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] })
  });

  const handlePlanMeal = (planId: string) => {
    setEditingPlanId(planId);
    setEditingMenuId(null);
    setMenuItems(['']);
    setMenuNotes('');
    setModalVisible(true);
  };

  const handleEditMeal = (menu: any) => {
    setEditingPlanId(menu.subscription_id);
    setEditingMenuId(menu.id);
    setMenuItems([...menu.items]);
    setMenuNotes(menu.notes || '');
    setModalVisible(true);
  };

  const copyPreviousMenu = () => {
    if (!editingPlanId || !menus) return;
    
    // Calculate the date exactly 7 days before the selectedDate
    const selectedDateObj = new Date(selectedDate);
    selectedDateObj.setDate(selectedDateObj.getDate() - 7);
    const lastWeekStr = selectedDateObj.toISOString().split('T')[0];

    const lastWeekMenu = menus.find(m => m.subscription_id === editingPlanId && m.effective_date === lastWeekStr);
    
    if (lastWeekMenu) {
      setMenuItems(lastWeekMenu.items);
      setMenuNotes(lastWeekMenu.notes || '');
    } else {
      // Fallback: If no menu exactly 7 days ago, grab the most recent one overall
      const pastMenus = menus
        .filter(m => m.subscription_id === editingPlanId && m.effective_date < selectedDate)
        .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
      
      if (pastMenus.length > 0) {
        setMenuItems(pastMenus[0].items);
        setMenuNotes(pastMenus[0].notes || '');
      } else {
        Alert.alert('No History', 'There are no past menus to copy from.');
      }
    }
  };

  const autofillWeek = useMutation({
    mutationFn: async () => {
      if (!plans || plans.length === 0 || !menus) return;
      const inserts = [];
      const todayObj = new Date(todayStr);

      for (let i = 0; i < 7; i++) {
        const targetDate = new Date(todayObj); targetDate.setDate(targetDate.getDate() + i);
        const targetStr = targetDate.toISOString().split('T')[0];
        const pastDate = new Date(targetDate); pastDate.setDate(pastDate.getDate() - 7);
        const pastStr = pastDate.toISOString().split('T')[0];

        for (const plan of plans) {
          const existingTarget = menus.find(m => m.subscription_id === plan.id && m.effective_date === targetStr);
          if (existingTarget) continue;

          const pastMenu = menus.find(m => m.subscription_id === plan.id && m.effective_date === pastStr);
          if (pastMenu) {
            inserts.push({
              subscription_id: plan.id,
              effective_date: targetStr,
              items: pastMenu.items,
              notes: pastMenu.notes,
              status: 'active'
            });
          }
        }
      }

      if (inserts.length === 0) throw new Error("No past menus found to copy, or your upcoming week is already fully planned!");

      const { error } = await supabase.from('menus').insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: (count) => {
      if (count) {
        Alert.alert('Success', `Autofilled ${count} menus for the upcoming week based on your past week's rotation!`);
        queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
      }
    },
    onError: (err: any) => Alert.alert('Autofill Status', err.message)
  });

  const selectedDateObj = new Date(selectedDate);
  const displayDate = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isSelectedPast = selectedDate < todayStr;

  const updateItem = (index: number, val: string) => {
    const newArr = [...menuItems]; newArr[index] = val; setMenuItems(newArr);
  };
  const removeItem = (index: number) => {
    const newArr = menuItems.filter((_, i) => i !== index); setMenuItems(newArr.length ? newArr : ['']);
  };

  if (kLoading || pLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF6B6B" /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Planner</Text>
        <TouchableOpacity style={styles.autofillBtn} onPress={() => autofillWeek.mutate()} disabled={autofillWeek.isPending}>
          {autofillWeek.isPending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.autofillBtnText}>🪄 Autofill Week</Text>}
        </TouchableOpacity>
      </View>

      {/* HORIZONTAL CALENDAR STRIP */}
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

      {/* DAILY CHECKLIST */}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.dateHeading}>{isSelectedPast ? 'Historical Menu' : 'Plan for'} {displayDate}</Text>

        {holidays?.find(h => h.holiday_date === selectedDate) ? (
          <View style={styles.holidayState}>
            <Text style={styles.holidayEmoji}>🏖️</Text>
            <Text style={styles.holidayTitle}>Kitchen Closed</Text>
            <Text style={styles.holidaySub}>You marked this day as a holiday ({holidays.find(h => h.holiday_date === selectedDate).reason}). Customers will not expect meals.</Text>
          </View>
        ) : !plans || plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Active Plans</Text>
            <Text style={styles.emptySub}>Create a meal plan first (like "Veg Lunch") before you can schedule a daily menu.</Text>
          </View>
        ) : (
          plans.map(plan => {
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
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => Alert.alert('Delete Menu?', 'Remove this menu?', [{text: 'Cancel'}, {text: 'Delete', style: 'destructive', onPress: () => deleteMenu.mutate(planMenu.id)}])}>
                          <Text style={styles.deleteBtnText}>🗑️</Text>
                        </TouchableOpacity>
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
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* SIMPLIFIED SMART MODAL */}
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
              <TouchableOpacity onPress={copyPreviousMenu}><Text style={styles.copyLink}>📋 Copy last {selectedDateObj.toLocaleDateString('en-US', { weekday: 'short' })}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setMenuItems([...menuItems, ''])}><Text style={styles.addItemLink}>+ Add Dish</Text></TouchableOpacity>
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
  modalSub: { fontSize: 13, color: '#667085', marginTop: 2, fontWeight: '500' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: '#344054' },
  addItemLink: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },
  copyLink: { color: '#101828', fontWeight: '700', fontSize: 14 },
  
  itemsBlock: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24, gap: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  removeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#DC2626', fontSize: 18, fontWeight: '700' },
  
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
