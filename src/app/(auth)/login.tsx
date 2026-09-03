import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [requestedRole, setRequestedRole] = useState<'vendor' | 'driver'>('vendor');

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 8;
  };

  async function signInWithEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address');
      return;
    }
    if (!validateEmail(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }
    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        Alert.alert('Login Failed', error.message || 'Unable to sign in. Please try again.');
      }
    } catch {
      Alert.alert('Login Failed', 'Unable to reach the service. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function signUpWithEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter an email address');
      return;
    }
    if (!validateEmail(normalizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }
    if (!password) {
      Alert.alert('Missing Password', 'Please enter a password');
      return;
    }
    if (!validatePassword(password)) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      // Explicitly pass the selected role during signup so the database trigger parses it correctly
      const { data: { session }, error } = await supabase.auth.signUp({ 
        email: normalizedEmail, 
        password,
        options: { data: { requested_role: requestedRole } }
      });
      if (error) Alert.alert('Signup Failed', error.message || 'Unable to create account');
      else if (!session) Alert.alert('Check Inbox', 'Please check your inbox for email verification!');
    } catch {
      Alert.alert('Signup Failed', 'Unable to reach the service. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>Vindu</Text>
          <Text style={styles.subtitle}>Partner Portal</Text>
        </View>
        
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              onChangeText={setEmail}
              value={email}
              placeholder="hello@kitchen.com"
              placeholderTextColor="#98A2B3"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              onChangeText={setPassword}
              value={password}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#98A2B3"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>I am signing up as a...</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <TouchableOpacity 
                style={[{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' }, requestedRole === 'vendor' && { borderColor: '#FF6B6B', backgroundColor: '#FEF2F2' }]} 
                onPress={() => setRequestedRole('vendor')}
              >
                <Text style={[{ fontWeight: '700', color: '#6B7280' }, requestedRole === 'vendor' && { color: '#DC2626' }]}>🧑‍🍳 Kitchen</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' }, requestedRole === 'driver' && { borderColor: '#16A34A', backgroundColor: '#F0FDF4' }]} 
                onPress={() => setRequestedRole('driver')}
              >
                <Text style={[{ fontWeight: '700', color: '#6B7280' }, requestedRole === 'driver' && { color: '#16A34A' }]}>🛵 Driver</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]} 
            onPress={signInWithEmail} 
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Sign In</Text>}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton, loading && styles.buttonDisabled]} 
            onPress={signUpWithEmail} 
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Create Partner Account</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 42, fontWeight: '900', color: '#FF6B6B', letterSpacing: -1 },
  subtitle: { fontSize: 16, color: '#667085', fontWeight: '500', marginTop: 4 },
  form: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#344054', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#101828' },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  primaryButton: { backgroundColor: '#FF6B6B' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAECF0' },
  secondaryButtonText: { color: '#344054', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },
});
