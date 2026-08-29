import { supabase } from './supabase';

export interface Kitchen {
  id: string;
  vendor_id: string;
  name: string;
  address: string;
}

export interface Menu {
  id: string;
  kitchen_id: string;
  date: string;
  slot: string;
  description: string;
  price: number;
}

export async function fetchKitchens(): Promise<Kitchen[]> {
  const { data, error } = await supabase.from('kitchens').select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchMenus(kitchenId: string): Promise<Menu[]> {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('kitchen_id', kitchenId);
  if (error) throw new Error(error.message);
  return data || [];
}

