-- =============================================================================
-- Migration 009 — COD order engine: snapshots, pending_confirmation, clicks, AI signals
-- (idempotent — safe to re-run)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supabase hosts uuid-ossp in the extensions schema; gen_random_uuid() is always available.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_price_snapshot           numeric(10,2),
  ADD COLUMN IF NOT EXISTS affiliate_commission_mad_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_snapshot            numeric(10,2),
  ADD COLUMN IF NOT EXISTS packaging_fee_snapshot           numeric(10,2),
  ADD COLUMN IF NOT EXISTS confirmation_fee_snapshot        numeric(10,2),
  ADD COLUMN IF NOT EXISTS attribution_click_id             uuid;

-- Backfill snapshots from live product data where missing
UPDATE public.orders o
SET
  product_price_snapshot = COALESCE(
    o.product_price_snapshot,
    ROUND(o.total_amount / NULLIF(o.quantity, 0), 2)
  ),
  affiliate_commission_mad_snapshot = COALESCE(
    o.affiliate_commission_mad_snapshot,
    o.commission_amount
  )
WHERE o.product_price_snapshot IS NULL
   OR o.affiliate_commission_mad_snapshot IS NULL;

UPDATE public.orders o
SET
  delivery_fee_snapshot     = COALESCE(o.delivery_fee_snapshot,     COALESCE(p.delivery_fee_mad, 0)),
  packaging_fee_snapshot    = COALESCE(o.packaging_fee_snapshot,    COALESCE(p.packaging_fee_mad, 10)),
  confirmation_fee_snapshot = COALESCE(o.confirmation_fee_snapshot, COALESCE(p.confirmation_fee_mad, 10))
FROM public.products p
WHERE o.product_id = p.id
  AND (
    o.delivery_fee_snapshot IS NULL
    OR o.packaging_fee_snapshot IS NULL
    OR o.confirmation_fee_snapshot IS NULL
  );

-- ── 2. AI-ready signal columns (extensible scoring pipeline) ─────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fraud_score           numeric(5,2),
  ADD COLUMN IF NOT EXISTS duplicate_risk_score  numeric(5,2),
  ADD COLUMN IF NOT EXISTS spam_score              numeric(5,2),
  ADD COLUMN IF NOT EXISTS signals_metadata      jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 3. Status lifecycle: pending → pending_confirmation ─────────────────────

UPDATE public.orders
   SET status = 'pending_confirmation'
 WHERE status = 'pending';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending_confirmation',
      'confirmed',
      'shipped',
      'delivered',
      'returned',
      'cancelled'
    ));

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'pending_confirmation';

-- ── 4. Affiliate click tracking ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  session_id     text,
  referrer_path  text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_id
  ON public.affiliate_clicks(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product_id
  ON public.affiliate_clicks(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_session
  ON public.affiliate_clicks(session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clicks: anon insert" ON public.affiliate_clicks;
CREATE POLICY "clicks: anon insert"
  ON public.affiliate_clicks FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "clicks: authenticated insert" ON public.affiliate_clicks;
CREATE POLICY "clicks: authenticated insert"
  ON public.affiliate_clicks FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "clicks: affiliates read own" ON public.affiliate_clicks;
CREATE POLICY "clicks: affiliates read own"
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() IN ('admin', 'agent'));

-- FK from orders to clicks (added after table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_attribution_click_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_attribution_click_id_fkey
      FOREIGN KEY (attribution_click_id) REFERENCES public.affiliate_clicks(id);
  END IF;
END $$;

-- ── 5. Order signals table (fraud / duplicate / spam / conversion analytics) ─

CREATE TABLE IF NOT EXISTS public.order_signals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  signal_type  text        NOT NULL
                           CHECK (signal_type IN ('fraud', 'duplicate', 'spam', 'conversion')),
  score        numeric(5,2) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_signals_order_id
  ON public.order_signals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_signals_type
  ON public.order_signals(signal_type, created_at DESC);

ALTER TABLE public.order_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signals: admin read" ON public.order_signals;
CREATE POLICY "signals: admin read"
  ON public.order_signals FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "signals: admin insert" ON public.order_signals;
CREATE POLICY "signals: admin insert"
  ON public.order_signals FOR INSERT TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "signals: service insert" ON public.order_signals;
CREATE POLICY "signals: service insert"
  ON public.order_signals FOR INSERT TO anon
  WITH CHECK (true);

-- ── 6. One commission per order (fixes ON CONFLICT DO NOTHING) ───────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_order_id_unique
  ON public.commissions(order_id);

-- ── 7. Commission trigger uses snapshot when present ────────────────────────

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commission numeric(10,2);
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status <> 'delivered'
     AND NEW.affiliate_id IS NOT NULL
  THEN
    v_commission := COALESCE(NEW.affiliate_commission_mad_snapshot, NEW.commission_amount);

    IF v_commission > 0 THEN
      INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
      VALUES (NEW.affiliate_id, NEW.id, v_commission, 'pending')
      ON CONFLICT (order_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_delivered ON public.orders;
CREATE TRIGGER trg_order_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_delivered();
