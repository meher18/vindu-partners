import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, Modal, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
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

  // Fetch Kitchen ID
  const { data: kitchen } = useQuery({
    queryKey: ['vendor-kitchen', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('kitchens').select('id').eq('vendor_id', user?.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch Existing Menus
  const { data: menus, isLoading } = useQuery({
    queryKey: ['vendor-menus', kitchen?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menus')
        .select('*')
        .eq('kitchen_id', kitchen?.id)
        .order('effective_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!kitchen?.id,
  });

  // Create Menu Mutation
  const createMenu = useMutation({
    mutationFn: async () => {
      const filteredItems = menuItems.filter(item => item.trim() !== '');
      if (filteredItems.length === 0) throw new Error("Please add at least one item");

      const { data, error } = await supabase.from('menus').insert([{
        kitchen_id: kitchen?.id,
        slot_name: slotName,
        effective_date: effectiveDate,
        items: filteredItems,
        status: 'active' // MVP auto-active
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Menus</Text>
        <Button title="+ Create Menu" onPress={() => setModalVisible(true)} color="orange" />
      </View>

      <ScrollView style={styles.list}>
        {isLoading && <Text>Loading menus...</Text>}
        {menus?.length === 0 && <Text style={styles.empty}>No menus published yet.</Text>}
        
        {menus?.map((menu) => (
          <View key={menu.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.planTitle}>{menu.effective_date} ({menu.slot_name.toUpperCase()})</Text>
              <Text style={styles.status}>{menu.status.toUpperCase()}</Text>
            </View>
            <View style={styles.itemsList}>
              {menu.items.map((item: string, idx: number) => (
                <Text key={idx} style={styles.item}>• {item}</Text>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CREATE MENU MODAL */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Publish a Menu</Text>
          
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={effectiveDate} onChangeText={setEffectiveDate} />

          <Text style={styles.label}>Slot (lunch, dinner)</Text>
          <TextInput style={styles.input} value={slotName} onChangeText={setSlotName} />

          <View style={styles.itemsHeader}>
            <Text style={styles.label}>Menu Items (e.g. "Dal Makhani", "2 Roti")</Text>
            <TouchableOpacity onPress={addItem}>
              <Text style={styles.addText}>+ Add Item</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.itemsScrollView}>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <TextInput 
                  style={[styles.input, styles.flexInput]} 
                  value={item} 
                  onChangeText={(val) => updateItem(index, val)}
                  placeholder={`Item ${index + 1}`}
                />
                <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>X</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <View style={styles.modalButtons}>
            <Button title="Cancel" onPress={() => setModalVisible(false)} color="gray" />
            <Button title="Publish Menu" onPress={() => createMenu.mutate()} color="orange" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold' },
  list: { padding: 20 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  planTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  status: { fontSize: 14, fontWeight: 'bold', color: '#0066cc' },
  itemsList: { marginTop: 5 },
  item: { color: '#555', fontSize: 15, marginBottom: 3 },
  modalContainer: { flex: 1, padding: 30, backgroundColor: '#fff', paddingTop: 60 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 30 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 16 },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addText: { color: 'orange', fontWeight: 'bold' },
  itemsScrollView: { maxHeight: 300, marginBottom: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start' },
  flexInput: { flex: 1, marginRight: 10 },
  removeBtn: { padding: 15, backgroundColor: '#ffebe6', borderRadius: 8 },
  removeText: { color: 'red', fontWeight: 'bold' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingBottom: 40 }
});
