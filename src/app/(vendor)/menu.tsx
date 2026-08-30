import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type TabType = 'upcoming' | 'past';

export default function VendorMenu() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  const today = new Date().toISOString().split('T')[0];
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<string[]>(['']);

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: plans } = useQuery({
    queryKey: ['vendor-plans', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('id, diet_type, slot_name').eq('kitchen_id', kitchen?.id).neq('status', 'cancelled');
      if (error) throw error;
      if (data && data.length > 0 && !selectedPlanId) setSelectedPlanId(data[0].id);
      return data;
    },
    enabled: !!kitchen?.id,
  });

  const { data: menus, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendor-menus', kitchen?.id],
    queryFn: async () => {
      if (!plans || plans.length === 0) return [];
      const planIds = plans.map(p => p.id);
      const { data, error } = await supabase.from('menus').select('*, subscription:subscriptions(diet_type, slot_name)').in('subscription_id', planIds).order('effective_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!plans && plans.length > 0,
  });

  const createMenu = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error("Please select a plan first.");
      if (effectiveDate < today) throw new Error("You cannot publish a menu for a past date.");
      const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 7);
      if (effectiveDate > maxDate.toISOString().split('T')[0]) throw new Error("Menus can only be scheduled up to 7 days in advance.");
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one menu item.");

      // Check if menu already exists for this date+plan
      const exists = menus?.find(m => m.effective_date === effectiveDate && m.subscription_id === selectedPlanId);
      if (exists) throw new Error(`You already have a menu published for this plan on ${effectiveDate}. Please delete it first if you want to replace it.`);

      const { data, error } = await supabase.from('menus').insert([{
        subscription_id: selectedPlanId,
        effective_date: effectiveDate,
        items: filteredItems,
        status: 'active'
      }]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setModalVisible(false);
      setMenuItems(['']);
      setEffectiveDate(today);
      queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
      setActiveTab('upcoming');
    },
    onError: (err: any) => Alert.alert('Cannot Publish', err.message)
  });

  const deleteMenu = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menus').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] }),
    onError: (err: any) => Alert.alert('Error', 'Could not delete menu: ' + err.message)
  });

  const copyPreviousMenu = () => {
    if (!selectedPlanId || !menus) return;
    // Find the most recent menu for this specific plan that is BEFORE the currently selected effectiveDate
    const pastMenus = menus
      .filter(m => m.subscription_id === selectedPlanId && m.effective_date < effectiveDate)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
    
    if (pastMenus.length > 0) {
      setMenuItems(pastMenus[0].items);
    } else {
      Alert.alert('No History', 'There are no past menus for this plan to copy from.');
    }
  };

  const handleDelete = (id: string, dateStr: string) => {
    Alert.alert('Delete Menu?', `Are you sure you want to remove the menu for ${dateStr}? Customers will no longer see it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMenu.mutate(id) }
    ]);
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...menuItems];
    newItems[index] = value;
    setMenuItems(newItems);
  };
  const addItem = () => setMenuItems([...menuItems, '']);
  const removeItem = (index: number) => {
    const newItems = menuItems.filter((_, i) => i !== index);
    setMenuItems(newItems.length ? newItems : ['']);
  };

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), value: d.toISOString().split('T')[0] };
  });

  const filteredMenus = menus?.filter(m => activeTab === 'upcoming' ? m.effective_date >= today : m.effective_date < today)
    .sort((a, b) => activeTab === 'upcoming' 
      ? new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime()
      : new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
    );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Daily Menus</Text>
          <Text style={styles.subtitle}>Plan what you'll cook</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => {
          if (!plans || plans.length === 0) {
            Alert.alert('No Plans', 'Please create a Meal Plan first before publishing a menu.');
            return;
          }
          setModalVisible(true);
        }}>
          <Text style={styles.addButtonText}>+ Publish</Text>
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]} onPress={() => setActiveTab('upcoming')}>
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'past' && styles.tabActive]} onPress={() => setActiveTab('past')}>
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>Past Menus</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color="#FF6B6B" />}
        
        {!isLoading && filteredMenus?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>{activeTab === 'upcoming' ? '📝' : '🕰️'}</Text>
            <Text style={styles.emptyTitle}>No {activeTab === 'upcoming' ? 'Upcoming' : 'Past'} Menus</Text>
            <Text style={styles.emptySub}>
              {activeTab === 'upcoming' 
                ? "You haven't scheduled any meals. Publish your menu so customers can order!" 
                : "Your past menus will appear here for reference."}
            </Text>
          </View>
        )}

        {filteredMenus?.map((menu: any) => {
          const menuDate = new Date(menu.effective_date);
          const dateStr = menuDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
          const isPast = menu.effective_date < today;
          const planName = `${menu.subscription?.diet_type?.toUpperCase()} ${menu.subscription?.slot_name?.toUpperCase()}`;
          return (
            <View key={menu.id} style={[styles.card, isPast && styles.cardPast]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.menuDate}>{dateStr}</Text>
                  <Text style={styles.menuSlot}>{planName}</Text>
                </View>
                {!isPast && (
                  <TouchableOpacity style={styles.deleteIconBtn} onPress={() => handleDelete(menu.id, dateStr)}>
                    <Text style={styles.deleteIconText}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.itemsWrapper}>
                {menu.items.map((item: string, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={styles.itemDot} />
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* PUBLISH MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Publish Menu</Text>
          <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeBtn}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContainer}>

          <Text style={styles.label}>Select Plan</Text>
          <View style={styles.chipRow}>
            {plans?.map((p: any) => (
              <TouchableOpacity key={p.id} style={[styles.chip, selectedPlanId === p.id && styles.chipActive]} onPress={() => setSelectedPlanId(p.id)}>
                <Text style={[styles.chipText, selectedPlanId === p.id && styles.chipTextActive]}>{p.diet_type.toUpperCase()} {p.slot_name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {dateOptions.map(d => (
                <TouchableOpacity key={d.value} style={[styles.chip, effectiveDate === d.value && styles.chipActive]} onPress={() => setEffectiveDate(d.value)}>
                  <Text style={[styles.chipText, effectiveDate === d.value && styles.chipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={styles.itemsHeaderRow}>
            <Text style={styles.label}>Menu Items</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={copyPreviousMenu}><Text style={styles.copyLink}>📋 Copy Previous</Text></TouchableOpacity>
              <TouchableOpacity onPress={addItem}><Text style={styles.addItemLink}>+ Add Dish</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.itemsBlock}>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.dishRow}>
                <TextInput style={[styles.input, styles.dishInput]} value={item} onChangeText={(val) => updateItem(index, val)} placeholder={`e.g. 2 Butter Roti`} placeholderTextColor="#9CA3AF" />
                <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={() => createMenu.mutate()} disabled={createMenu.isPending}>
            {createMenu.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Publish Menu</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, backgroundColor: '#FFF' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  addButton: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  tabsRow: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  tab: { paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#FF6B6B' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#667085' },
  tabTextActive: { color: '#FF6B6B' },
  list: { padding: 24 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40, padding: 32, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#667085', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  card: { backgroundColor: '#FFF', padding: 24, borderRadius: 24, marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardPast: { opacity: 0.6, backgroundColor: '#F9FAFB' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F2F4F7', paddingBottom: 16 },
  menuDate: { fontSize: 18, fontWeight: '800', color: '#101828', marginBottom: 4 },
  menuSlot: { fontSize: 13, color: '#667085', fontWeight: '600' },
  deleteIconBtn: { padding: 8, backgroundColor: '#FEF2F2', borderRadius: 12 },
  deleteIconText: { fontSize: 16 },
  itemsWrapper: { marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B', marginRight: 12 },
  itemText: { fontSize: 15, color: '#344054', fontWeight: '500' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#344054', marginBottom: 12, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#EAECF0' },
  chipActive: { backgroundColor: '#FEF0EC', borderColor: '#FF6B6B' },
  chipText: { fontSize: 14, color: '#667085', fontWeight: '600' },
  chipTextActive: { color: '#FF6B6B', fontWeight: '700' },
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  addItemLink: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },
  copyLink: { color: '#101828', fontWeight: '700', fontSize: 14, marginRight: 8 },
  itemsBlock: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24 },
  dishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#101828' },
  dishInput: { flex: 1, marginBottom: 0, marginRight: 10 },
  removeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
