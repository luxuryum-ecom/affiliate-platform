-- =============================================================================
-- Migration 013 — Pricing & commission business rules
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. products.platform_margin_type — 'percentage' | 'fixed'
--   2. products.platform_margin_value — the margin value (percent or MAD)
--   3. products.delivery_fee_config — JSONB for future courier API integration
--   4. orders.cancelled_at — audit timestamp missing from COD orders
--   5. wholesale_orders.delivery_cost — delivery cost separate from tier price
--   6. commissions.reversed + commissions.reversed_at — reversal support
--   7. handle_order_status_reversal() trigger — auto-reverse on returned/cancelled
-- =============================================================================

-- ── 1. Products: platform margin type and value ───────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_margin_type text NOT NULL DEFAULT 'percentage';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_platform_margin_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_platform_margin_type_check
    CHECK (platform_margin_type IN ('percentage', 'fixed'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_margin_value numeric(10,2);

-- Backfill platform_margin_value from the existing margin_percentage column.
-- For existing products the margin was always percentage, so the value is the same.
UPDATE public.products
  SET platform_margin_value = margin_percentage
  WHERE platform_margin_value IS NULL;

COMMENT ON COLUMN public.products.platform_margin_type IS
  '''percentage'' — platform_price = factory_cost × (1 + value / 100). '
  '''fixed'' — platform_price = factory_cost + value (MAD).';

COMMENT ON COLUMN public.products.platform_margin_value IS
  'The margin amount. Interpreted as a % when platform_margin_type = ''percentage'', '
  'or as an absolute MAD amount when platform_margin_type = ''fixed''.';

-- ── 2. Products: delivery fee config (future courier API readiness) ───────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_fee_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.delivery_fee_config IS
  'Reserved for future courier API integration. '
  'Shape: {carrier_code?, zone_overrides?: [{city, fee_mad}], api_enabled?: bool}. '
  'delivery_fee_mad remains the operative default; config overrides it when populated.';

-- ── 3. Orders: cancelled_at audit timestamp ───────────────────────────────────
-- wholesale_orders already has cancelled_at (migration 004).
-- COD orders were missing it.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Backfill cancelled_at for rows already in cancelled state
UPDATE public.orders
  SET cancelled_at = updated_at
  WHERE status = 'cancelled'
    AND cancelled_at IS NULL;

-- ── 4. Wholesale orders: separate delivery cost ───────────────────────────────
-- Wholesale price = factory_cost + tier_margin + delivery_cost.
-- Previously total_amount folded delivery in; now it is tracked separately
-- so the breakdown is auditable and the order item subtotals stay pure.

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS delivery_cost numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wholesale_orders.delivery_cost IS
  'Delivery cost for the whole wholesale order in MAD. '
  'Separate from product tier prices. '
  'total_amount = sum(line subtotals) + delivery_cost.';

-- ── 5. Commissions: reversal support ─────────────────────────────────────────
-- When a delivered order is later returned or cancelled, its commission must be
-- reversed so it is excluded from payout calculations.

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS reversed     boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at  timestamptz;

-- Existing commissions with status 'pending' on returned/cancelled orders
-- are safe — they cannot be paid. Mark them reversed for consistency.
UPDATE public.commissions c
  SET reversed    = true,
      reversed_at = c.created_at
  FROM public.orders o
  WHERE c.order_id = o.id
    AND o.status IN ('returned', 'cancelled')
    AND c.reversed = false;

CREATE INDEX IF NOT EXISTS idx_commissions_reversed
  ON public.commissions (reversed, affiliate_id)
  WHERE reversed = false;

-- ── 6. Commission reversal trigger ───────────────────────────────────────────
-- Fires after any status update on orders.
-- If the order was delivered and is now returned or cancelled,
-- reverse all non-reversed commissions for that order.

CREATE OR REPLACE FUNCTION public.handle_order_status_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'delivered'
     AND NEW.status IN ('returned', 'cancelled')
  THEN
    UPDATE public.commissions
      SET reversed    = true,
          reversed_at = now()
      WHERE order_id = NEW.id
        AND reversed  = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_reversal ON public.orders;
CREATE TRIGGER trg_order_status_reversal
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_reversal();
