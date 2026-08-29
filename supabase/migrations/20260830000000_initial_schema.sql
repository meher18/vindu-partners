-- ==========================================
-- VINDU - PHASE 1: DATABASE SCHEMA
-- ==========================================
-- Copy and paste this entire script into your Supabase SQL Editor and hit RUN.

-- 1. Create Custom ENUM Types
CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'driver', 'admin');
CREATE TYPE kitchen_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE diet_type AS ENUM ('veg', 'non-veg', 'vegan', 'customized');
CREATE TYPE duration_type AS ENUM ('daily', 'weekly', 'monthly', 'custom', 'trial');
CREATE TYPE slot_name AS ENUM ('breakfast', 'lunch', 'dinner', 'custom');
CREATE TYPE delivery_type AS ENUM ('home_delivery', 'takeaway');
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'completed');
CREATE TYPE menu_status AS ENUM ('pending', 'active');
CREATE TYPE delivery_status AS ENUM ('scheduled', 'vendor_ready', 'picked_up', 'delivered', 'failed');
CREATE TYPE transaction_type AS ENUM ('deposit', 'refund', 'skip_credit', 'subscription_payment');
CREATE TYPE ledger_status AS ENUM ('pending', 'paid');

-- 2. Create Tables
-- PROFILES (Linked to Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role user_role DEFAULT 'customer',
  full_name TEXT,
  phone TEXT,
  delivery_address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DELIVERY ZONES
CREATE TABLE delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_codes TEXT[] NOT NULL
);

-- KITCHENS
CREATE TABLE kitchens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  zone_id UUID REFERENCES delivery_zones(id),
  fssai_number TEXT,
  status kitchen_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUBSCRIPTIONS (Vendor Plans)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id UUID REFERENCES kitchens(id) ON DELETE CASCADE NOT NULL,
  diet_type diet_type NOT NULL,
  duration_type duration_type NOT NULL,
  slot_name slot_name NOT NULL,
  slot_target_time TIME NOT NULL,
  delivery_type delivery_type NOT NULL,
  price_per_day NUMERIC NOT NULL,
  vendor_fee NUMERIC NOT NULL,
  delivery_fee NUMERIC NOT NULL,
  capacity INT NOT NULL,
  status subscription_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CUSTOMER SUBSCRIPTIONS (Purchased Plans)
CREATE TABLE customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  quantity INT DEFAULT 1,
  premium_unlocked BOOLEAN DEFAULT false,
  status subscription_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENUS
CREATE TABLE menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id UUID REFERENCES kitchens(id) ON DELETE CASCADE NOT NULL,
  slot_name slot_name NOT NULL,
  effective_date DATE NOT NULL,
  status menu_status DEFAULT 'pending',
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SKIPS
CREATE TABLE skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_subscription_id UUID REFERENCES customer_subscriptions(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  credited_amount NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DELIVERIES (Daily Batches)
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_subscription_id UUID REFERENCES customer_subscriptions(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  status delivery_status DEFAULT 'scheduled',
  vendor_ready_at TIMESTAMPTZ,
  qr_scanned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  driver_id UUID REFERENCES profiles(id),
  proof_photo_url TEXT,
  otp_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WALLETS
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WALLET TRANSACTIONS
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  type transaction_type NOT NULL,
  description TEXT,
  delivery_id UUID REFERENCES deliveries(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VENDOR LEDGER
CREATE TABLE vendor_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id UUID REFERENCES kitchens(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE NOT NULL,
  gross_amount NUMERIC NOT NULL,
  penalty_amount NUMERIC DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  status ledger_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DRIVER LEDGER
CREATE TABLE driver_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE NOT NULL,
  gross_amount NUMERIC NOT NULL,
  penalty_amount NUMERIC DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  status ledger_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RATINGS (Two-part rating: Food & Driver)
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE UNIQUE NOT NULL,
  customer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  kitchen_id UUID REFERENCES kitchens(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES profiles(id),
  food_stars INT CHECK (food_stars BETWEEN 1 AND 5),
  driver_stars INT CHECK (driver_stars BETWEEN 1 AND 5),
  review_text TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. Automation: Trigger for New Users
-- ==========================================
-- When a new user signs up via Supabase Auth, automatically create their `profile` and their `wallet`.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  
  -- Insert a wallet initialized with 0 balance
  INSERT INTO public.wallets (customer_id, balance)
  VALUES (new.id, 0);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ==========================================
-- 4. Enable Row Level Security (RLS)
-- ==========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchens ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE skips ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Note: We will add specific RLS Policies in a subsequent script once the tables exist, 
-- but this safely turns off public write access immediately.
