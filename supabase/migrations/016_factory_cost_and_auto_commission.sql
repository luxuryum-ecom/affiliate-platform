-- =============================================================================
-- Migration 016 — Explicit factory_cost_mad + auto-commission formula
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. products.factory_cost_mad — explicit admin-settable factory cost in MAD
--      (back-filled from purchase_price_mad; replaces manual commission entry)
-- =============================================================================

-- ── 1. Add factory_cost_mad column ───────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS factory_cost_mad numeric(10,2);

COMMENT ON COLUMN public.products.factory_cost_mad IS
  'Explicit factory cost in MAD set by admin. '
  'Used as the base for commission auto-calculation: '
  'commission = sell_price - factory_cost_mad - platform_margin - delivery_fee_mad - confirmation_fee_mad - packaging_fee_mad. '
  'Back-filled from purchase_price_mad on migration.';

-- ── 2. Back-fill from purchase_price_mad for existing products ────────────────

UPDATE public.products
  SET factory_cost_mad = purchase_price_mad
  WHERE factory_cost_mad IS NULL
    AND purchase_price_mad IS NOT NULL;
