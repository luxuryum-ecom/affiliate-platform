-- =============================================================================
-- Migration 004 — Order tracking, COD fields, stock logic, public order form
-- (idempotent — safe to re-run)
-- =============================================================================

-- ── 1. affiliate_id nullable ──────────────────────────────────────────────────

ALTER TABLE public.orders ALTER COLUMN affiliate_id DROP NOT NULL;

-- ── 2. COD traceability columns ───────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_company          text,
  ADD COLUMN IF NOT EXISTS tracking_number           text,
  ADD COLUMN IF NOT EXISTS cod_expected              numeric(10,2),
  ADD COLUMN IF NOT EXISTS cod_received              numeric(10,2),
  ADD COLUMN IF NOT EXISTS confirmed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at                timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at              timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at               timestamptz,
  ADD COLUMN IF NOT EXISTS return_reason             text,
  ADD COLUMN IF NOT EXISTS cod_transfer_received_at  timestamptz;

-- ── 3. handle_order_delivered — null-safe, commission guard ──────────────────

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status <> 'delivered'
     AND NEW.affiliate_id IS NOT NULL
     AND NEW.commission_amount > 0
  THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
    VALUES (NEW.affiliate_id, NEW.id, NEW.commission_amount, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Wholesale order status — simplified lifecycle ──────────────────────────

UPDATE public.wholesale_orders
   SET status = CASE
     WHEN status IN ('submitted', 'contacted')                         THEN 'pending'
     WHEN status IN ('validated', 'awaiting_payment', 'paid', 'ready') THEN 'confirmed'
     WHEN status = 'completed'                                          THEN 'delivered'
     ELSE status
   END;

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

CREATE OR REPLACE FUNCTION public.reserve_stock(p_product_id uuid, p_qty integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current integer;
BEGIN
  SELECT stock_count INTO v_current
    FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_current IS NULL OR v_current < p_qty THEN RETURN false; END IF;
  UPDATE public.products SET stock_count = stock_count - p_qty WHERE id = p_product_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_stock(p_product_id uuid, p_qty integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.products SET stock_count = stock_count + p_qty WHERE id = p_product_id;
$$;

-- ── 7. RLS additions ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "products: anon read active" ON public.products;
CREATE POLICY "products: anon read active"
  ON public.products FOR SELECT TO anon
  USING (active = true AND approval_status = 'approved');

DROP POLICY IF EXISTS "orders: anon insert" ON public.orders;
CREATE POLICY "orders: anon insert"
  ON public.orders FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders: agent read" ON public.orders;
CREATE POLICY "orders: agent read"
  ON public.orders FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "wholesale_orders: admin insert" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: admin insert"
  ON public.wholesale_orders FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "wholesale_order_items: admin insert" ON public.wholesale_order_items;
CREATE POLICY "wholesale_order_items: admin insert"
  ON public.wholesale_order_items FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "cart: admin delete" ON public.wholesale_cart_items;
CREATE POLICY "cart: admin delete"
  ON public.wholesale_cart_items FOR DELETE TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

-- ── 8. Additional indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_null
  ON public.orders (created_at DESC) WHERE affiliate_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_company
  ON public.orders (delivery_company) WHERE delivery_company IS NOT NULL;
