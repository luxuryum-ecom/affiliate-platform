-- =============================================================================
-- Migration 017 — Affiliate order source + wholesaler billing fields
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. orders.order_source   — how the affiliate captured the order
--      values: 'whatsapp' | 'phone' | 'manual' | 'sheet_import' | 'api'
--   2. profiles billing fields — optional wholesaler invoice data:
--      company_name, ice, registre_commerce, billing_address
-- =============================================================================

-- ── 1. orders.order_source ────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text
    CHECK (order_source IN ('whatsapp', 'phone', 'manual', 'sheet_import', 'api'))
    DEFAULT 'manual';

COMMENT ON COLUMN public.orders.order_source IS
  'Channel through which the affiliate captured the order. '
  'Null for legacy orders placed via the public product page.';

-- ── 2. Wholesaler billing fields on profiles ──────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS ice text,
  ADD COLUMN IF NOT EXISTS registre_commerce text,
  ADD COLUMN IF NOT EXISTS billing_address text;

COMMENT ON COLUMN public.profiles.company_name     IS 'Optional company name used for wholesale invoices.';
COMMENT ON COLUMN public.profiles.ice              IS 'Identifiant Commun de l''Entreprise (ICE). Optional.';
COMMENT ON COLUMN public.profiles.registre_commerce IS 'Registre de commerce number. Optional.';
COMMENT ON COLUMN public.profiles.billing_address  IS 'Billing address for wholesale invoices. Optional.';
