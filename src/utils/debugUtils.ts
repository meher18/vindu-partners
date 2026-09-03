/**
 * Debugging utilities for development and testing
 * Provides tools for inspecting app state, checking auth, and validating data
 */

import { supabase } from '@/lib/supabase';
import Logger from './logger';

export const debugUtils = {
  /**
   * Get current auth session and user info
   */
  getAuthState: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        createdAt: session?.user?.created_at,
      };
    } catch (error) {
      Logger.error('Failed to get auth state', error);
      return { error: true, message: 'Failed to get auth state' };
    }
  },

  /**
   * Get user profile and role
   */
  getUserProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      Logger.error('Failed to fetch user profile', error);
      return { error: true, message: 'Failed to fetch profile' };
    }
  },

  /**
   * Get kitchen info for current vendor
   */
  getKitchenInfo: async (vendorId: string) => {
    try {
      const { data, error } = await supabase
        .from('kitchens')
        .select('*')
        .eq('vendor_id', vendorId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      Logger.error('Failed to fetch kitchen info', error);
      return { error: true, message: 'Failed to fetch kitchen' };
    }
  },

  /**
   * Check database connectivity
   */
  checkDatabaseConnection: async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      return { connected: true, samplesReturned: data?.length || 0 };
    } catch (error) {
      Logger.error('Database connectivity check failed', error);
      return { connected: false, error: error };
    }
  },

  /**
   * Validate all required fields in kitchen setup
   */
  validateKitchenSetup: (kitchen: any) => {
    const issues: string[] = [];
    
    if (!kitchen.name?.trim()) issues.push('Kitchen name is missing');
    if (!kitchen.address?.trim()) issues.push('Address is missing');
    if (!kitchen.phone) issues.push('Phone number is missing');
    if (!kitchen.fssai) issues.push('FSSAI license is missing');
    if (!kitchen.delivery_radius) issues.push('Delivery radius is not set');
    if (kitchen.status === 'inactive') issues.push('Kitchen is inactive');
    
    return {
      valid: issues.length === 0,
      issues,
    };
  },

  /**
   * Get all stored logs
   */
  getLogs: () => {
    return Logger.getLogs();
  },

  /**
   * Export debug report
   */
  generateDebugReport: async (userId: string) => {
    try {
      const authState = await debugUtils.getAuthState();
      const profile = await debugUtils.getUserProfile(userId);
      const kitchen = await debugUtils.getKitchenInfo(userId);
      const dbConnection = await debugUtils.checkDatabaseConnection();
      const logs = debugUtils.getLogs();

      return {
        timestamp: new Date().toISOString(),
        auth: authState,
        profile,
        kitchen,
        database: dbConnection,
        recentLogs: logs.slice(-20),
      };
    } catch (error) {
      Logger.error('Failed to generate debug report', error);
      return { error: true, message: 'Failed to generate report' };
    }
  },

  /**
   * Clear all logs (use with caution)
   */
  clearLogs: () => {
    Logger.clear();
    return { message: 'Logs cleared' };
  },
};

/**
 * Development-only debugging function
 * Access via console: __DEV__ && debugUtils.(...) or window.debugUtils
 */
if (__DEV__) {
  (globalThis as any).debugUtils = debugUtils;
}
