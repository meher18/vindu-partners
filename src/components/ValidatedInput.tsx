import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';

interface ValidatedInputProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  validator?: (value: string) => { valid: boolean; error?: string };
  errorMessage?: string;
  required?: boolean;
  helperText?: string;
  multiline?: boolean;
  numberOfLines?: number;
}

export const ValidatedInput: React.FC<ValidatedInputProps> = ({
  label,
  value,
  onChangeText,
  validator,
  errorMessage,
  required,
  helperText,
  multiline = false,
  numberOfLines,
  ...props
}) => {
  const [touched, setTouched] = useState(false);

  const validationResult = touched && validator ? validator(value) : { valid: true };
  const hasError = touched && (errorMessage || !validationResult.valid);
  const displayError = errorMessage || validationResult.error;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}>*</Text>}
        </Text>
      </View>

      <TextInput
        style={[
          styles.input,
          hasError && styles.inputError,
          multiline && styles.inputMultiline,
        ]}
        value={value}
        onChangeText={onChangeText}
        onBlur={() => setTouched(true)}
        placeholderTextColor="#A0A0A0"
        multiline={multiline}
        numberOfLines={numberOfLines}
        {...props}
      />

      {hasError && (
        <Text style={styles.error}>{displayError}</Text>
      )}

      {helperText && !hasError && (
        <Text style={styles.helper}>{helperText}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  required: {
    color: '#DC2626',
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#FFF',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  inputMultiline: {
    paddingVertical: 12,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  error: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
    fontWeight: '500',
  },
  helper: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
