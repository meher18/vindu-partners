/**
 * Validation utilities for vendor app forms
 */

export const validators = {
  /**
   * Validate email format
   */
  email: (email: string): { valid: boolean; error?: string } => {
    if (!email.trim()) return { valid: false, error: 'Email is required' };
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) return { valid: false, error: 'Invalid email format' };
    return { valid: true };
  },

  /**
   * Validate password strength
   */
  password: (password: string): { valid: boolean; error?: string } => {
    if (!password) return { valid: false, error: 'Password is required' };
    if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(password) && !/[a-z]/.test(password)) {
      return { valid: false, error: 'Password must contain letters' };
    }
    return { valid: true };
  },

  /**
   * Validate 10-digit phone number
   */
  phone: (phone: string): { valid: boolean; error?: string } => {
    if (!phone.trim()) return { valid: false, error: 'Phone number is required' };
    const clean = phone.replace(/\D/g, '');
    if (clean.length !== 10) return { valid: false, error: 'Phone must be exactly 10 digits' };
    return { valid: true };
  },

  /**
   * Validate 14-digit FSSAI number
   */
  fssai: (fssai: string): { valid: boolean; error?: string } => {
    if (!fssai.trim()) return { valid: false, error: 'FSSAI license is required' };
    const clean = fssai.replace(/\D/g, '');
    if (clean.length !== 14) return { valid: false, error: 'FSSAI must be exactly 14 digits' };
    return { valid: true };
  },

  /**
   * Validate kitchen name
   */
  kitchenName: (name: string): { valid: boolean; error?: string } => {
    if (!name.trim()) return { valid: false, error: 'Kitchen name is required' };
    if (name.length < 3) return { valid: false, error: 'Kitchen name must be at least 3 characters' };
    if (name.length > 50) return { valid: false, error: 'Kitchen name cannot exceed 50 characters' };
    return { valid: true };
  },

  /**
   * Validate address
   */
  address: (address: string): { valid: boolean; error?: string } => {
    if (!address.trim()) return { valid: false, error: 'Address is required' };
    if (address.length < 10) return { valid: false, error: 'Address must be at least 10 characters' };
    if (address.length > 200) return { valid: false, error: 'Address cannot exceed 200 characters' };
    return { valid: true };
  },

  /**
   * Validate delivery radius (km)
   */
  radius: (radius: string): { valid: boolean; error?: string } => {
    if (!radius.trim()) return { valid: false, error: 'Delivery radius is required' };
    const radiusInt = parseInt(radius);
    if (isNaN(radiusInt)) return { valid: false, error: 'Radius must be a number' };
    if (radiusInt <= 0) return { valid: false, error: 'Radius must be greater than 0' };
    if (radiusInt > 50) return { valid: false, error: 'Radius cannot exceed 50 km' };
    return { valid: true };
  },

  /**
   * Validate meal price (per day in ₹)
   */
  price: (price: number): { valid: boolean; error?: string } => {
    if (!price || price <= 0) return { valid: false, error: 'Price must be greater than 0' };
    if (price < 50) return { valid: false, error: 'Price must be at least ₹50 per day' };
    if (price > 500) return { valid: false, error: 'Price cannot exceed ₹500 per day' };
    return { valid: true };
  },

  /**
   * Validate meal capacity
   */
  capacity: (capacity: number): { valid: boolean; error?: string } => {
    if (!capacity || capacity <= 0) return { valid: false, error: 'Capacity must be greater than 0' };
    if (capacity < 5) return { valid: false, error: 'Minimum capacity is 5 meals' };
    if (capacity > 500) return { valid: false, error: 'Maximum capacity is 500 meals' };
    return { valid: true };
  },

  /**
   * Validate menu item
   */
  menuItem: (item: string): { valid: boolean; error?: string } => {
    const trimmed = item.trim();
    if (!trimmed) return { valid: false, error: 'Menu item cannot be empty' };
    if (trimmed.length < 2) return { valid: false, error: 'Menu item must be at least 2 characters' };
    if (trimmed.length > 100) return { valid: false, error: 'Menu item cannot exceed 100 characters' };
    return { valid: true };
  },

  /**
   * Validate UPI ID format
   */
  upi: (upiId: string): { valid: boolean; error?: string } => {
    if (!upiId.trim()) return { valid: false, error: 'UPI ID is required' };
    const upiLower = upiId.trim().toLowerCase();
    const upiRegex = /^[a-z0-9._-]+@[a-z]{2,}$/i;
    if (!upiRegex.test(upiLower)) {
      return { valid: false, error: 'Invalid UPI format. Use: username@bankname (e.g., myname@okhdfcbank)' };
    }
    return { valid: true };
  },

  /**
   * Validate date string (YYYY-MM-DD)
   */
  date: (dateStr: string): { valid: boolean; error?: string } => {
    if (!dateStr) return { valid: false, error: 'Date is required' };
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return { valid: false, error: 'Date format must be YYYY-MM-DD' };
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return { valid: false, error: 'Invalid date' };
    return { valid: true };
  },

  /**
   * Validate that date is not in the past
   */
  futureDate: (dateStr: string, todayStr: string): { valid: boolean; error?: string } => {
    if (dateStr < todayStr) return { valid: false, error: 'Date cannot be in the past' };
    return { valid: true };
  },
};

/**
 * Batch validate multiple fields
 */
export const validateForm = (
  fields: Record<string, { value: any; validator: (value: any) => { valid: boolean; error?: string } }>
): { valid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  let valid = true;

  Object.entries(fields).forEach(([fieldName, { value, validator }]) => {
    const result = validator(value);
    if (!result.valid) {
      errors[fieldName] = result.error || 'Invalid input';
      valid = false;
    }
  });

  return { valid, errors };
};
