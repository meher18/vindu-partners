import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

const hapticFeedback = {
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  info: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};

export const showNotification = async (type: NotificationType, title: string, message?: string) => {
  await hapticFeedback[type]();
  
  if (message) {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
};

export const showSuccess = async (title: string, message?: string) => {
  await showNotification('success', title, message);
};

export const showError = async (title: string, message?: string) => {
  await showNotification('error', title, message);
};

export const showWarning = async (title: string, message?: string) => {
  await showNotification('warning', title, message);
};

export const showConfirmation = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: 'Confirm', style: 'default', onPress: onConfirm },
  ]);
};

export const showDestructiveConfirmation = (title: string, message: string, onConfirm: () => void) => {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
};

/**
 * Parse error objects from various sources and return user-friendly message
 */
export const parseErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error_description) return error.error_description;
  if (error?.msg) return error.msg;
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Format validation error messages consistently
 */
export const getValidationError = (field: string, reason: string): string => {
  return `${field}: ${reason}`;
};
