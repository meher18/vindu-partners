import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Alert } from 'react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Logger from '@/utils/logger';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

export default function RootLayout() {
  const { setUser, setRole, setLoading, user, isLoading, role } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  async function fetchUserRole(userId: string, retries = 5) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data && data.role) {
        Logger.info('User role fetched', { role: data.role });
        setRole(data.role as any);
        setLoading(false);
        return;
      } else {
        throw new Error('Profile not ready yet');
      }
    } catch (err: any) {
      Logger.error('Failed to fetch user role', { userId, retries, error: err.message });
      if (retries > 0) {
        setTimeout(() => fetchUserRole(userId, retries - 1), 1000);
        return;
      }
      Logger.warn('Failed to fetch role after retries', { userId });
      setLoading(false);
    }
  }

  useEffect(() => {
    Logger.info('App initialization started');
    supabase.auth.getSession().then(({ data: { session } }) => {
      Logger.debug('Auth session retrieved', { hasSession: !!session });
      setUser(session?.user ?? null);
      if (session?.user) fetchUserRole(session.user.id);
      else setLoading(false);
    }).catch((error) => {
      Logger.error('Failed to get auth session', error);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserRole(session.user.id);
        } else {
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user) {
      if (role === 'customer') {
        Alert.alert('Access Denied', 'This app is for registered partners only.');
        supabase.auth.signOut();
      } else if (role === 'vendor' && segments[0] !== '(vendor)') {
        router.replace('/(vendor)');
      } else if (role === 'driver' && segments[0] !== '(driver)') {
        router.replace('/(driver)');
      }
    }
  }, [user, isLoading, segments, role]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Slot />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
