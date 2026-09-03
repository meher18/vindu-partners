/**
 * Centralized API utility layer for consistent error handling and request management
 */

import { supabase } from '@/lib/supabase';
import Logger from './logger';
import { parseErrorMessage } from './notifications';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
  status: number;
}

class ApiClient {
  /**
   * Handle Supabase RLS policy errors and provide user-friendly messages
   */
  private static handleRLSError(error: any): string {
    const message = error?.message || '';
    
    if (message.includes('new row violates row level security policy')) {
      return 'You do not have permission to create this item';
    }
    if (message.includes('row level security policy denied')) {
      return 'You do not have permission to access this item';
    }
    if (message.includes('permission denied')) {
      return 'Permission denied. Please check your account role.';
    }
    
    return parseErrorMessage(error);
  }

  /**
   * Perform a SELECT query with error handling
   */
  static async select<T>(
    table: string,
    select: string = '*',
    filter?: { column: string; operator: string; value: any }
  ): Promise<ApiResponse<T[]>> {
    try {
      Logger.debug(`Fetching from ${table}`, { select, filter });
      
      let query = supabase.from(table).select(select);
      
      if (filter) {
        if (filter.operator === 'eq') {
          query = query.eq(filter.column, filter.value);
        } else if (filter.operator === 'in') {
          query = query.in(filter.column, filter.value);
        } else if (filter.operator === 'gte') {
          query = query.gte(filter.column, filter.value);
        } else if (filter.operator === 'lte') {
          query = query.lte(filter.column, filter.value);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      Logger.debug(`Successfully fetched ${data?.length || 0} records from ${table}`);
      return { data: data as T[], success: true, status: 200 };
    } catch (error: any) {
      const message = this.handleRLSError(error);
      Logger.error(`Failed to fetch from ${table}`, error);
      return { error: message, success: false, status: error?.status || 500 };
    }
  }

  /**
   * Perform an INSERT query with error handling
   */
  static async insert<T>(table: string, data: T[]): Promise<ApiResponse<T[]>> {
    try {
      Logger.debug(`Inserting into ${table}`, { count: data.length });
      
      const { data: result, error } = await supabase.from(table).insert(data as any);
      
      if (error) throw error;

      Logger.info(`Successfully inserted ${data.length} records into ${table}`);
      return { data: result as unknown as T[], success: true, status: 201 };
    } catch (error: any) {
      const message = this.handleRLSError(error);
      Logger.error(`Failed to insert into ${table}`, error);
      return { error: message, success: false, status: error?.status || 500 };
    }
  }

  /**
   * Perform an UPDATE query with error handling
   */
  static async update<T>(
    table: string,
    data: Partial<T>,
    filter: { column: string; value: any }
  ): Promise<ApiResponse<T[]>> {
    try {
      Logger.debug(`Updating ${table}`, { filter });
      
      const { data: result, error } = await supabase
        .from(table)
        .update(data as any)
        .eq(filter.column, filter.value);
      
      if (error) throw error;

      Logger.info(`Successfully updated records in ${table}`);
      return { data: result as unknown as T[], success: true, status: 200 };
    } catch (error: any) {
      const message = this.handleRLSError(error);
      Logger.error(`Failed to update ${table}`, error);
      return { error: message, success: false, status: error?.status || 500 };
    }
  }

  /**
   * Perform a DELETE query with error handling
   */
  static async delete(table: string, filter: { column: string; value: any }): Promise<ApiResponse<null>> {
    try {
      Logger.debug(`Deleting from ${table}`, { filter });
      
      const { error } = await supabase.from(table).delete().eq(filter.column, filter.value);
      
      if (error) throw error;

      Logger.info(`Successfully deleted records from ${table}`);
      return { data: null, success: true, status: 200 };
    } catch (error: any) {
      const message = this.handleRLSError(error);
      Logger.error(`Failed to delete from ${table}`, error);
      return { error: message, success: false, status: error?.status || 500 };
    }
  }

  /**
   * Perform UPSERT with error handling
   */
  static async upsert<T>(
    table: string,
    data: T[],
    onConflict: string
  ): Promise<ApiResponse<T[]>> {
    try {
      Logger.debug(`Upserting into ${table}`, { count: data.length });
      
      const { data: result, error } = await supabase.from(table).upsert(data as any, { onConflict });
      
      if (error) throw error;

      Logger.info(`Successfully upserted into ${table}`);
      return { data: result as unknown as T[], success: true, status: 200 };
    } catch (error: any) {
      const message = this.handleRLSError(error);
      Logger.error(`Failed to upsert into ${table}`, error);
      return { error: message, success: false, status: error?.status || 500 };
    }
  }

  /**
   * Retry a failed request with exponential backoff
   */
  static async retryWithBackoff<T>(
    fn: () => Promise<ApiResponse<T>>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<ApiResponse<T>> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await fn();
      
      if (result.success) return result;
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        Logger.warn(`Retrying after ${delay}ms`, { attempt: i + 1 });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { error: 'Max retries exceeded', success: false, status: 500 };
  }
}

export default ApiClient;
