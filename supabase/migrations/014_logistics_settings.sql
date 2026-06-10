-- =============================================================================
-- Migration 014 — Logistics settings for COD orders
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. logistics_settings — singleton table for city-based delivery/return fees
--   2. orders.return_fee_snapshot — fee snapshot captured at order creation
-- =============================================================================

-- ── 1. logistics_settings singleton table ─────────────────────────────────────
-- Single-row table enforced by CHECK (id = 'default').
-- Structured for future shipping-company API integration via api_config JSONB.

CREATE TABLE IF NOT EXISTS public.logistics_settings (
  id                         text PRIMARY KEY DEFAULT 'default',
  casablanca_delivery_fee_mad numeric(10,2) NOT NULL DEFAULT 25,
  default_delivery_fee_mad    numeric(10,2) NOT NULL DEFAULT 40,
  return_fee_mad              numeric(10,2) NOT NULL DEFAULT 10,
  -- Reserved for future courier API: {carrier_code?, webhook_url?, api_enabled?}
  api_config                  jsonb         NOT NULL DEFAULT '{}'::jsonb,
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id)
);

ALTER TABLE public.logistics_settings
  DROP CONSTRAINT IF EXISTS logistics_settings_singleton;

ALTER TABLE public.logistics_settings
  ADD CONSTRAINT logistics_settings_singleton CHECK (id = 'default');

COMMENT ON TABLE public.logistics_settings IS
  'Global COD logistics configuration (singleton row, id = ''default''). '
  'Holds city-based delivery fees and return fee. '
  'api_config is reserved for future courier API integration.';

COMMENT ON COLUMN public.logistics_settings.casablanca_delivery_fee_mad IS
  'Delivery fee in MAD when customer city is Casablanca.';

COMMENT ON COLUMN public.logistics_settings.default_delivery_fee_mad IS
  'Delivery fee in MAD for all Moroccan cities except Casablanca.';

COMMENT ON COLUMN public.logistics_settings.return_fee_mad IS
  'Fee charged per returned COD order regardless of city.';

COMMENT ON COLUMN public.logistics_settings.api_config IS
  'Reserved for future courier API integration. '
  'Shape: {carrier_code?, webhook_url?, api_enabled?: bool}.';

-- Seed the default row (safe no-op if already exists)
INSERT INTO public.logistics_settings (id)
  VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS on logistics_settings ──────────────────────────────────────────────
ALTER TABLE public.logistics_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_admin_all ON public.logistics_settings;
CREATE POLICY logistics_admin_all ON public.logistics_settings
  FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- Authenticated users (affiliate, wholesaler) can read — needed server-side by
-- placeOrder which runs in the anon/service context. Read via service role key.
-- No separate public read policy; placeOrder uses the service-role client.

-- ── 3. orders.return_fee_snapshot ─────────────────────────────────────────────
-- Captured at order creation from logistics_settings.return_fee_mad.
-- Immutable snapshot so returned-order cost is auditable even if settings change.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_fee_snapshot numeric(10,2);

COMMENT ON COLUMN public.orders.return_fee_snapshot IS
  'Return fee in MAD at the time the order was placed. '
  'Sourced from logistics_settings.return_fee_mad. '
  'Used to track logistics cost if the order is returned.';

-- Backfill existing orders with the current default (10 MAD)
UPDATE public.orders
  SET return_fee_snapshot = 10
  WHERE return_fee_snapshot IS NULL;
