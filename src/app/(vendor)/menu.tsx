import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type SlotType = 'lunch' | 'dinner';

const SLOT_OPTIONS: { label: string; value: SlotType; emoji: string }[] = [
  { label: 'Lunch', value: 'lunch', emoji: '🌤️' },
  { label: 'Dinner', value: 'dinner', emoji: '🌙' },
];

export default function VendorMenu() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [slotName, setSlotName] = useState<SlotType>('lunch');
  const [menuItems, setMenuItems] = useState<string[]>(['']);

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: menus, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendor-menus', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('menus').select('*').eq('kitchen_id', kitchen?.id).order('effective_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!kitchen?.id,
  });

  const createMenu = useMutation({
    mutationFn: async () => {
      // Validation: no past dates
      if (effectiveDate < today) {
        throw new Error("You cannot publish a menu for a past date.");
      }
      // Validation: max 7 days ahead
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 7);
      if (effectiveDate > maxDate.toISOString().split('T')[0]) {
        throw new Error("Menus can only be scheduled up to 7 days in advance.");
      }
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one menu item.");

      const { data, error } = await supabase.from('menus').insert([{
        kitchen_id: kitchen?.id,
        slot_name: slotName,
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
    },
    onError: (err: any) => Alert.alert('Cannot Publish', err.message)
  });

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

  // Date quick-select helpers
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), value: d.toISOString().split('T')[0] };
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Daily Menus</Text>
          <Text style={styles.subtitle}>Publish menus for specific dates</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Publish</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color="#FF6B6B" />}
        {isError && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>Failed to load menus</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
          </View>
        )}

        {!isLoading && menus?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>No Published Menus</Text>
            <Text style={styles.emptySub}>Let customers know what you are serving this week.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyBtnText}>Publish First Menu</Text>
            </TouchableOpacity>
          </View>
        )}

        {menus?.map((menu: any) => {
          const slot = SLOT_OPTIONS.find(s => s.value === menu.slot_name);
          const menuDate = new Date(menu.effective_date);
          const isPast = menu.effective_date < today;
          return (
            <View key={menu.id} style={[styles.card, isPast && styles.cardPast]}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.menuDate}>{menuDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })}</Text>
                  <Text style={styles.menuSlot}>{slot?.emoji} {menu.slot_name.toUpperCase()}</Text>
                </View>
                {isPast
                  ? <View style={styles.pastBadge}><Text style={styles.pastBadgeText}>PAST</Text></View>
                  : <View style={[styles.statusBadge, menu.status === 'active' ? styles.statusActive : styles.statusPending]}>
                      <Text style={[styles.statusText, menu.status === 'active' ? styles.statusTextActive : styles.statusTextPending]}>{menu.status.toUpperCase()}</Text>
                    </View>
                }
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

          {/* Date Quick Select */}
          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {dateOptions.map(d => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.chip, effectiveDate === d.value && styles.chipActive]}
                  onPress={() => setEffectiveDate(d.value)}
                >
                  <Text style={[styles.chipText, effectiveDate === d.value && styles.chipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Slot */}
          <Text style={styles.label}>Meal Slot</Text>
          <View style={styles.chipRow}>
            {SLOT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, slotName === opt.value && styles.chipActive]}
                onPress={() => setSlotName(opt.value)}
              >
                <Text>{opt.emoji}</Text>
                <Text style={[styles.chipText, slotName === opt.value && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Menu Items */}
          <View style={styles.itemsHeaderRow}>
            <Text style={styles.label}>Menu Items</Text>
            <TouchableOpacity onPress={addItem}><Text style={styles.addItemLink}>+ Add Dish</Text></TouchableOpacity>
          </View>
          <View style={styles.itemsBlock}>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.dishRow}>
                <TextInput
                  style={[styles.input, styles.dishInput]}
                  value={item}
                  onChangeText={(val) => updateItem(index, val)}
                  placeholder={`e.g. 2 Butter Roti`}
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  addButton: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  list: { padding: 24 },
  errorWrap: { alignItems: 'center', paddingVertical: 40 },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 16, color: '#374151', marginBottom: 16 },
  retryBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: '#FFF', fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40, padding: 32, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#667085', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  emptyBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { fontWeight: '700', color: '#FFF' },
  card: { backgroundColor: '#FFF', padding: 24, borderRadius: 24, marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardPast: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F2F4F7', paddingBottom: 16 },
  menuDate: { fontSize: 18, fontWeight: '800', color: '#101828', marginBottom: 4 },
  menuSlot: { fontSize: 13, color: '#667085', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusActive: { backgroundColor: '#ECFDF3' },
  statusTextActive: { color: '#027A48', fontSize: 12, fontWeight: '700' },
  statusPending: { backgroundColor: '#FFFAEB' },
  statusTextPending: { color: '#B54708', fontSize: 12, fontWeight: '700' },
  pastBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pastBadgeText: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  itemsWrapper: { marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B', marginRight: 12 },
  itemText: { fontSize: 15, color: '#344054', fontWeight: '500' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#344054', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1.5, borderColor: '#EAECF0' },
  chipActive: { backgroundColor: '#FEF0EC', borderColor: '#FF6B6B' },
  chipText: { fontSize: 14, color: '#667085', fontWeight: '600' },
  chipTextActive: { color: '#FF6B6B', fontWeight: '700' },
  itemsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  addItemLink: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },
  itemsBlock: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24 },
  dishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#101828' },
  dishInput: { flex: 1, marginBottom: 0, marginRight: 10 },
  removeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 12, fontWeight: '700' },
});
