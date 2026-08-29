import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setRole } = useAuthStore();

  const handleBypass = (role: 'customer' | 'vendor' | 'driver') => {
    setUser({ id: 'dummy-123', email: 'test@example.com' } as any);
    setRole(role);
  };

  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) Alert.alert(error.message);
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) Alert.alert(error.message);
    if (!session) Alert.alert('Please check your inbox for email verification!');
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vindu</Text>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          onChangeText={setEmail}
          value={email}
          placeholder="email@address.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          onChangeText={setPassword}
          value={password}
          secureTextEntry
          placeholder="Password"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Sign in" disabled={loading} onPress={signInWithEmail} />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button title="Sign up" disabled={loading} onPress={signUpWithEmail} />
      </View>

      <View style={styles.testContainer}>
        <Text style={styles.testLabel}>-- Test UI Bypass --</Text>
        <Button title="Enter as Customer" color="tomato" onPress={() => handleBypass('customer')} />
        <Button title="Enter as Vendor" color="orange" onPress={() => handleBypass('vendor')} />
        <Button title="Enter as Driver" color="blue" onPress={() => handleBypass('driver')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 5,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
  },
  buttonContainer: {
    marginTop: 10,
  },
  testContainer: {
    marginTop: 40,
    gap: 10,
  },
  testLabel: {
    textAlign: 'center',
    color: '#888',
    marginBottom: 10,
  }
});
