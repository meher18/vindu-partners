import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, TextInput, Linking } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import * as Haptics from 'expo-haptics';

const getLocalISODate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export default function DriverHub() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [otps, setOtps] = useState<Record<string, string>>({});

  const { data: deliveries, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['driver-deliveries', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('deliveries')
        .select(`
          *,
          customer_subscriptions:subscription_id (
            profiles:customer_id (id, full_name, phone_number, delivery_address),
            subscriptions:plan_id (
              kitchens:kitchen_id (id, name, address)
            )
          )
        `)
        .eq('date', getLocalISODate(new Date()))
        .or(`status.eq.vendor_ready,driver_id.eq.${user.id}`);
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const claimDelivery = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { error } = await supabase.from('deliveries')
        .update({ driver_id: user?.id })
        .eq('id', deliveryId)
        .is('driver_id', null);
      if (error) throw error;
    },
    onSuccess: () => { 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
      queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] }); 
    },
    onError: (err: any) => Alert.alert('Failed', err.message)
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, otp }: { id: string, status: string, otp?: string }) => {
      const updates: any = { status };
      if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString();
      }
      const { error } = await supabase.from('deliveries')
        .update(updates)
        .eq('id', id)
        .eq('driver_id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => { 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); 
      queryClient.invalidateQueries({ queryKey: ['driver-deliveries'] }); 
    },
    onError: (err: any) => Alert.alert('Failed', err.message)
  });

  if (isLoading && !isRefetching) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </SafeAreaView>
    );
  }

  const handleVerifyOtpAndDeliver = (delivery: any) => {
    const enteredOtp = otps[delivery.id] || '';
    if (enteredOtp !== delivery.otp_code) {
      Alert.alert('Error', 'Incorrect OTP. Please try again.');
      return;
    }
    updateStatus.mutate({ id: delivery.id, status: 'delivered', otp: enteredOtp });
  };

  const todayStr = getLocalISODate(new Date());

  // Filter deliveries
  const availablePickups = deliveries?.filter(d => d.status === 'vendor_ready' && !d.driver_id) || [];
  const activeDeliveries = deliveries?.filter(d => d.driver_id === user?.id && ['vendor_ready', 'picked_up'].includes(d.status)) || [];
  const completedDeliveries = deliveries?.filter(d => d.driver_id === user?.id && d.status === 'delivered') || [];

  const dailyEarnings = completedDeliveries.reduce((sum, d) => sum + (d.delivery_fee || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#FF6B6B" />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Delivery Hub</Text>
            <Text style={styles.dateText}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
          </View>
          <View style={styles.earningsBadge}>
            <Text style={styles.earningsLabel}>Earned Today</Text>
            <Text style={styles.earningsAmount}>₹{dailyEarnings}</Text>
          </View>
        </View>

        {availablePickups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Pickups 📦</Text>
            {availablePickups.map(delivery => {
              const kitchen = delivery.customer_subscriptions?.subscriptions?.kitchens;
              return (
                <View key={delivery.id} style={styles.card}>
                  <Text style={styles.kitchenName}>{kitchen?.name || 'Unknown Kitchen'}</Text>
                  <Text style={styles.addressText}>{kitchen?.address || 'No address provided'}</Text>
                  <Text style={styles.detailText}>Boxes: {delivery.number_of_boxes || 1} • Slot: {delivery.slot || 'N/A'}</Text>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => claimDelivery.mutate(delivery.id)}
                    disabled={claimDelivery.isPending}
                  >
                    <Text style={styles.primaryButtonText}>Claim Delivery</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Active Deliveries 🛵</Text>
          {activeDeliveries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No active deliveries right now 😴</Text>
            </View>
          ) : (
            activeDeliveries.map(delivery => {
              const customer = delivery.customer_subscriptions?.profiles;
              return (
                <View key={delivery.id} style={styles.card}>
                  <Text style={styles.customerName}>{customer?.full_name || 'Customer'}</Text>
                  <Text style={styles.addressText}>{customer?.delivery_address || 'No address'}</Text>
                  
                  {customer?.phone_number && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${customer.phone_number}`)}>
                      <Text style={styles.phoneText}>📞 {customer.phone_number}</Text>
                    </TouchableOpacity>
                  )}
                  
                  <Text style={styles.detailText}>Slot: {delivery.slot || 'N/A'} • Status: {delivery.status}</Text>
                  
                  {delivery.status === 'vendor_ready' && (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => updateStatus.mutate({ id: delivery.id, status: 'picked_up' })}
                      disabled={updateStatus.isPending}
                    >
                      <Text style={styles.primaryButtonText}>Mark Picked Up</Text>
                    </TouchableOpacity>
                  )}

                  {delivery.status === 'picked_up' && (
                    <View style={styles.otpSection}>
                      <TextInput
                        style={styles.otpInput}
                        placeholder="Enter 4-digit OTP"
                        keyboardType="number-pad"
                        maxLength={4}
                        value={otps[delivery.id] || ''}
                        onChangeText={(val) => setOtps(prev => ({ ...prev, [delivery.id]: val }))}
                      />
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => handleVerifyOtpAndDeliver(delivery)}
                        disabled={updateStatus.isPending || !otps[delivery.id] || otps[delivery.id].length < 4}
                      >
                        <Text style={styles.primaryButtonText}>Confirm Delivery</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {completedDeliveries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed Today ✅</Text>
            {completedDeliveries.map(delivery => {
              const customer = delivery.customer_subscriptions?.profiles;
              return (
                <View key={delivery.id} style={[styles.card, styles.completedCard]}>
                  <View style={styles.completedRow}>
                    <View>
                      <Text style={styles.customerName}>{customer?.full_name || 'Customer'}</Text>
                      <Text style={styles.detailText}>Delivered at {new Date(delivery.delivered_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                    </View>
                    <Text style={styles.earnedText}>+₹{delivery.delivery_fee || 0}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  dateText: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
  },
  earningsBadge: {
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'flex-end',
  },
  earningsLabel: {
    fontSize: 12,
    color: '#319795',
    fontWeight: '600',
  },
  earningsAmount: {
    fontSize: 18,
    color: '#2C7A7B',
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  kitchenName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 8,
  },
  phoneText: {
    fontSize: 14,
    color: '#3182CE',
    marginBottom: 8,
    fontWeight: '500',
  },
  detailText: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#A0AEC0',
  },
  otpSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingTop: 12,
  },
  otpInput: {
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 8,
  },
  completedCard: {
    backgroundColor: '#F0FFF4',
    borderLeftWidth: 4,
    borderLeftColor: '#48BB78',
  },
  completedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earnedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2F855A',
  },
});
