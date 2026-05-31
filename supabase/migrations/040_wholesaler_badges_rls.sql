-- Migration 040: Wholesaler read access for active supplier subscriptions
-- Allows wholesalers (and other authenticated roles) to read active supplier
-- subscriptions so the marketplace page can display premium/verified badges.
-- Migration 038 only granted suppliers read access to their own row, which
-- blocked the badge query used by /wholesale/marketplace.

DROP POLICY IF EXISTS "subscriptions_wholesaler_read_active" ON supplier_subscriptions;
CREATE POLICY "subscriptions_wholesaler_read_active"
  ON supplier_subscriptions FOR SELECT
  USING (status = 'active');
