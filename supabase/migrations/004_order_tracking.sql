-- =============================================================================
-- Migration 004 — Order tracking, COD fields, stock logic, public order form
-- =============================================================================
-- Changes:
--  1. orders.affiliate_id → nullable  (customers order without login)
--  2. COD traceability fields on orders
--  3. Updated handle_order_delivered trigger (null-safe)
--  4. Wholesale order status simplified to 5 lifecycle states
--  5. Audit timestamps on wholesale_orders
--  6. Atomic stock helper functions (reserve_stock, restore_stock)
--  7. New RLS policies: anon product read, anon order insert, admin cart/order
--  8. Indexes
-- =============================================================================

-- ── 1. affiliate_id nullable — customers can order without a referral ─────────

ALTER TABLE public.orders
  ALTER COLUMN affiliate_id DROP NOT NULL;

-- ── 2. COD traceability columns ───────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_company          text,
  ADD COLUMN IF NOT EXISTS tracking_number           text,

  -- Reconciliation fields (anomaly detection foundation)
  -- cod_expected is set at confirmation = total_amount
  -- cod_received is recorded when admin receives the cash
  ADD COLUMN IF NOT EXISTS cod_expected              numeric(10,2),
  ADD COLUMN IF NOT EXISTS cod_received              numeric(10,2),

  -- Audit timestamps — set by application when transitioning status
  ADD COLUMN IF NOT EXISTS confirmed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at                timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at              timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at               timestamptz,

  -- Return reason for return-rate analysis
  ADD COLUMN IF NOT EXISTS return_reason             text,

  -- Payment transfer date — gap between delivered_at and this = COD delay
  ADD COLUMN IF NOT EXISTS cod_transfer_received_at  timestamptz;

-- ── 3. Updated handle_order_delivered — null-safe for no-affiliate orders ─────

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create commission when transitioning to delivered AND there is an affiliate
  IF new.status = 'delivered'
     AND old.status <> 'delivered'
     AND new.affiliate_id IS NOT NULL
  THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
    VALUES (new.affiliate_id, new.id, new.commission_amount, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- ── 4. Wholesale order status — simplified to a 5-state lifecycle ─────────────

-- Migrate existing rows to new status values before changing the constraint
UPDATE public.wholesale_orders
   SET status = CASE
     WHEN status IN ('submitted', 'contacted')                       THEN 'pending'
     WHEN status IN ('validated', 'awaiting_payment', 'paid', 'ready') THEN 'confirmed'
     WHEN status = 'completed'                                        THEN 'delivered'
     ELSE status  -- 'cancelled' stays as is
   END;

-- Drop old constraint and add the new one
ALTER TABLE public.wholesale_orders
  DROP CONSTRAINT IF EXISTS wholesale_orders_status_check;

ALTER TABLE public.wholesale_orders
  ADD CONSTRAINT wholesale_orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'sourcing', 'shipped', 'delivered', 'cancelled'));

-- ── 5. Audit timestamps on wholesale_orders ───────────────────────────────────

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sourcing_at   timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at    timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;

-- ── 6. Atomic stock helper functions ─────────────────────────────────────────
-- These run with SECURITY DEFINER to bypass RLS when called from server actions.
-- Using FOR UPDATE row-level locking prevents concurrent double-decrement.

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_qty        integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
BEGIN
  -- Lock the row for this transaction
  SELECT stock_count INTO v_current
    FROM public.products
   WHERE id = p_product_id
     FOR UPDATE;

  IF v_current IS NULL OR v_current < p_qty THEN
    RETURN false;
  END IF;

  UPDATE public.products
     SET stock_count = stock_count - p_qty
   WHERE id = p_product_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
     SET stock_count = stock_count + p_qty
   WHERE id = p_product_id;
$$;

-- ── 7. RLS additions ──────────────────────────────────────────────────────────

-- Public (anon) product reads — needed for the customer-facing product page
CREATE POLICY "products: anon read active"
  ON public.products FOR SELECT
  TO anon
  USING (active = true AND approval_status = 'approved');

-- Public (anon) order insert — customer places COD order without an account
CREATE POLICY "orders: anon insert"
  ON public.orders FOR INSERT
  TO anon
  WITH CHECK (true);

-- Admin/agent can also read all orders (agents may need it for order management)
CREATE POLICY "orders: agent read"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

-- Admin/agent can INSERT wholesale orders (creates from buyer cart)
CREATE POLICY "wholesale_orders: admin insert"
  ON public.wholesale_orders FOR INSERT
  TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

-- Admin/agent can INSERT wholesale order items (set at order creation)
CREATE POLICY "wholesale_order_items: admin insert"
  ON public.wholesale_order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

-- Admin/agent can DELETE cart items (clearing cart after order creation)
CREATE POLICY "cart: admin delete"
  ON public.wholesale_cart_items FOR DELETE
  TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

-- ── 8. Additional indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_null
  ON public.orders (created_at DESC)
  WHERE affiliate_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_company
  ON public.orders (delivery_company)
  WHERE delivery_company IS NOT NULL;

-- =============================================================================
-- Anomaly detection — future architecture note
-- =============================================================================
-- The following field pairs enable automated mismatch detection in Day N:
--
--  1. COD reconciliation:
--       orders.cod_expected vs orders.cod_received
--       → flag when cod_received < cod_expected (short payment)
--
--  2. Payment delay:
--       orders.delivered_at vs orders.cod_transfer_received_at
--       → alert when gap > X days (affiliate COD not transferred)
--
--  3. Excessive returns:
--       affiliate-level: COUNT(status='returned') / COUNT(*) > threshold
--       → flag affiliates with > 30% return rate
--
--  4. Wholesale delivery gaps:
--       wholesale_orders.shipped_at vs wholesale_orders.delivered_at
--       → alert on long in-transit duration
--
-- None of this logic is implemented yet — the fields are storage-only.
-- =============================================================================
