-- =============================================================================
-- Migration 006 — Stabilization fixes
-- =============================================================================
-- Applied after audit (Day 5 stabilization pass). No new features.
--
-- Fixes:
--   1. handle_order_delivered trigger — add commission_amount > 0 guard
--      to prevent CHECK constraint violation on commissions table when
--      a product has commission_amount = 0 but an affiliate_id is present.
--
--   2. products.updated_at — column existed in TypeScript types but was
--      missing from the schema. Added here with auto-update trigger.
-- =============================================================================

-- ── 1. Fix handle_order_delivered trigger ────────────────────────────────────
--
-- BUG: If orders.commission_amount = 0 and affiliate_id IS NOT NULL,
--      the trigger attempted INSERT INTO commissions (amount = 0) which
--      violated commissions.CHECK (amount > 0), raising a PostgreSQL error
--      and rolling back the status update.
--
-- FIX: Add AND new.commission_amount > 0 guard so the trigger is a no-op
--      when no commission is applicable (e.g. products with commission = 0).

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'delivered'
     AND old.status <> 'delivered'
     AND new.affiliate_id IS NOT NULL
     AND new.commission_amount > 0          -- guard: skip if no commission due
  THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
    VALUES (new.affiliate_id, new.id, new.commission_amount, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

-- ── 2. Add updated_at to products ────────────────────────────────────────────
--
-- The products table was created without an updated_at column, but the
-- TypeScript type included it. This adds the column and wires up the
-- existing handle_updated_at() trigger function (created in migration 001).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Back-fill with created_at for existing rows (best approximation)
UPDATE public.products SET updated_at = created_at WHERE updated_at = now();

-- Attach the auto-update trigger (same function used by orders and wholesale_orders)
DROP TRIGGER IF EXISTS products_updated_at ON public.products;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
