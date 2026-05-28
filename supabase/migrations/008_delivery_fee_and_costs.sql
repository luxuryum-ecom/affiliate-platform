-- =============================================================================
-- Migration 008 — Delivery fee + operational cost breakdown
-- =============================================================================
-- Adds delivery_fee_mad to products so each product carries its estimated
-- delivery cost. Combined with confirmation_fee_mad and packaging_fee_mad
-- (added in migration 007), this enables a full operational cost breakdown
-- per order visible to both admin and affiliate.
--
-- Seller cost model (for reference):
--   platform_cost_per_order = sell_price
--                           + confirmation_fee_mad
--                           + packaging_fee_mad
--                           + delivery_fee_mad
--   affiliate_commission    = commission_amount (fixed, paid after delivery)
--   platform_net_per_order  = sell_price - purchase_price_mad
--                           - confirmation_fee_mad - packaging_fee_mad - delivery_fee_mad
-- =============================================================================

-- ── 1. Add delivery_fee_mad ───────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_fee_mad numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.delivery_fee_mad IS
  'Estimated delivery company fee per order in MAD. '
  'Combined with confirmation_fee_mad + packaging_fee_mad = total operational cost.';

-- ── 2. Index for cost queries ─────────────────────────────────────────────────
-- (no dedicated index needed — queried only in admin views with small result sets)
