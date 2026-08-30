import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function VendorMenu() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);

  // Form State
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [slotName, setSlotName] = useState('lunch');
  const [menuItems, setMenuItems] = useState<string[]>(['']); // Array of items

  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: menus, isLoading } = useQuery({
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
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one item");

      const { data, error } = await supabase.from('menus').insert([{
        kitchen_id: kitchen?.id,
        slot_name: slotName.toLowerCase(),
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
      queryClient.invalidateQueries({ queryKey: ['vendor-menus', kitchen?.id] });
    },
    onError: (err) => Alert.alert('Error', err.message)
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

  return (
    <SafeAreaView style={styles.safeArea}>
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
        {isLoading && <ActivityIndicator style={{marginTop: 40}} color="#FF6B6B" />}
        {menus?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>No Published Menus</Text>
            <Text style={styles.emptySub}>Let customers know what you are serving this week.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyBtnText}>Publish First Menu</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {menus?.map((menu) => (
          <View key={menu.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.menuDate}>{new Date(menu.effective_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})}</Text>
                <Text style={styles.menuSlot}>{menu.slot_name.toUpperCase()}</Text>
              </View>
              <View style={[styles.statusBadge, menu.status === 'active' ? styles.statusActive : styles.statusPending]}>
                <Text style={[styles.statusText, menu.status === 'active' ? styles.statusTextActive : styles.statusTextPending]}>
                  {menu.status.toUpperCase()}
                </Text>
              </View>
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
        ))}
      </ScrollView>

      {/* CREATE MENU MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Publish Menu</Text>
          <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeBtn}>Cancel</Text></TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContainer}>
          <View style={styles.rowGrid}>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={effectiveDate} onChangeText={setEffectiveDate} />
            </View>
            <View style={{ width: 16 }} />
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Slot</Text>
              <TextInput style={styles.input} value={slotName} onChangeText={setSlotName} />
            </View>
          </View>

          <View style={styles.itemsHeader}>
            <Text style={styles.label}>Menu Items (Dishes/Quantities)</Text>
          </View>

          <View style={styles.itemsBlock}>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.dishRow}>
                <TextInput 
                  style={[styles.input, styles.dishInput]} 
                  value={item} 
                  onChangeText={(val) => updateItem(index, val)}
                  placeholder={`e.g. 2 Butter Roti, Dal Tadka...`}
                  placeholderTextColor="#98A2B3"
                />
                <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            
            <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
              <Text style={styles.addItemText}>+ Add another dish</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.saveBtn} 
            onPress={() => createMenu.mutate()} 
            disabled={createMenu.isPending}
          >
            {createMenu.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Publish Menu</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { fontSize: 14, color: '#667085', marginTop: 2 },
  addButton: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  list: { padding: 24 },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, padding: 32, backgroundColor: '#FFF', borderRadius: 24, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#667085', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  emptyBtn: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { fontWeight: '600', color: '#344054' },

  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F2F4F7', paddingBottom: 16 },
  menuDate: { fontSize: 18, fontWeight: '800', color: '#101828', marginBottom: 4 },
  menuSlot: { fontSize: 13, color: '#667085', fontWeight: '600', textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusActive: { backgroundColor: '#ECFDF3' },
  statusTextActive: { color: '#027A48', fontSize: 12, fontWeight: '700' },
  statusPending: { backgroundColor: '#FFFAEB' },
  statusTextPending: { color: '#B54708', fontSize: 12, fontWeight: '700' },
  
  itemsWrapper: { marginTop: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B', marginRight: 12 },
  itemText: { fontSize: 15, color: '#344054', fontWeight: '500' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F2F4F7' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  closeBtn: { fontSize: 16, color: '#667085', fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#FFF', padding: 24 },
  inputGroup: { marginBottom: 20 },
  rowGrid: { flexDirection: 'row' },
  label: { fontSize: 13, fontWeight: '600', color: '#344054', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  
  itemsHeader: { marginTop: 8, marginBottom: 12 },
  itemsBlock: { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', marginBottom: 24 },
  dishRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dishInput: { flex: 1, marginBottom: 0, backgroundColor: '#FFF' },
  removeBtn: { marginLeft: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3F2', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#B42318', fontSize: 16, fontWeight: 'bold' },
  addItemBtn: { paddingVertical: 12, alignItems: 'center' },
  addItemText: { color: '#FF6B6B', fontWeight: '700', fontSize: 15 },
  
  saveBtn: { backgroundColor: '#FF6B6B', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 40 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
