-- =============================================================================
-- Migration: 031_supplier_type_and_categories (idempotent — safe to re-run)
-- Adds supplier_type (morocco / international) to supplier_products
-- =============================================================================

-- ── Add supplier_type column ──────────────────────────────────────────────────

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'morocco'
  CHECK (supplier_type IN ('morocco', 'international'));

-- ── Backfill: existing rows default to 'morocco' (already set by DEFAULT) ─────
-- No explicit UPDATE needed; DEFAULT 'morocco' covers all existing rows.

-- ── Index for marketplace filtering by supplier_type ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_sp_supplier_type
  ON public.supplier_products(supplier_type);
