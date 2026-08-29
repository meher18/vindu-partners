-- ==========================================
-- VINDU - SUBSCRIPTIONS RLS
-- ==========================================

-- Anyone can view active subscriptions
CREATE POLICY "Anyone can view active subscriptions" ON subscriptions 
FOR SELECT USING (status = 'active');

-- Vendors can manage their own subscriptions
CREATE POLICY "Vendors can view own subscriptions" ON subscriptions 
FOR SELECT USING (
  kitchen_id IN (SELECT id FROM kitchens WHERE vendor_id = auth.uid())
);

CREATE POLICY "Vendors can insert own subscriptions" ON subscriptions 
FOR INSERT WITH CHECK (
  kitchen_id IN (SELECT id FROM kitchens WHERE vendor_id = auth.uid())
);

CREATE POLICY "Vendors can update own subscriptions" ON subscriptions 
FOR UPDATE USING (
  kitchen_id IN (SELECT id FROM kitchens WHERE vendor_id = auth.uid())
);
