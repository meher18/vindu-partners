-- ==========================================
-- VINDU - PHASE 2: ROW LEVEL SECURITY
-- ==========================================

-- PROFILES
-- Users can see their own profile
CREATE POLICY "Users can view own profile" ON profiles 
FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id);

-- KITCHENS
-- Anyone can view active kitchens
CREATE POLICY "Anyone can view active kitchens" ON kitchens 
FOR SELECT USING (status = 'active');

-- Vendors can view their own kitchens (even if pending/suspended)
CREATE POLICY "Vendors can view own kitchen" ON kitchens 
FOR SELECT USING (auth.uid() = vendor_id);

-- Vendors can create their own kitchen
CREATE POLICY "Vendors can insert own kitchen" ON kitchens 
FOR INSERT WITH CHECK (auth.uid() = vendor_id);

-- Vendors can update their own kitchen
CREATE POLICY "Vendors can update own kitchen" ON kitchens 
FOR UPDATE USING (auth.uid() = vendor_id);
