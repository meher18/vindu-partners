import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Logger from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    Logger.critical('ErrorBoundary caught an error', error);
    console.error('Error boundaries caught:', error, errorInfo);
    
    this.setState({ errorInfo });
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.errorBox}>
              <Text style={styles.title}>⚠️ Something Went Wrong</Text>
              <Text style={styles.message}>
                The app encountered an unexpected error. Please try again or restart the app.
              </Text>
              
              {this.state.error && (
                <View style={styles.errorDetails}>
                  <Text style={styles.errorTitle}>Error Details:</Text>
                  <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                </View>
              )}

              {__DEV__ && this.state.errorInfo && (
                <View style={styles.devInfo}>
                  <Text style={styles.devTitle}>Dev Info (Development Only):</Text>
                  <Text style={styles.devText}>{this.state.errorInfo.componentStack}</Text>
                </View>
              )}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={this.resetError}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    justifyContent: 'center',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#7F1D1D',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#991B1B',
    lineHeight: 24,
    marginBottom: 16,
  },
  errorDetails: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F1D1D',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontFamily: 'Courier',
  },
  devInfo: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  devTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F1D1D',
    marginBottom: 6,
  },
  devText: {
    fontSize: 11,
    color: '#991B1B',
    fontFamily: 'Courier',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
