import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

type UserRole = 'customer' | 'vendor' | 'driver' | null;

interface AuthState {
  user: User | null;
  role: UserRole;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setRole: (role: UserRole) => void;
  setLoading: (isLoading: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setRole: (role) => set({ role }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ user: null, role: null }),
}));
