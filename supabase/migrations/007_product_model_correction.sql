-- =============================================================================
-- Migration 007 — Product model correction
-- =============================================================================
-- Changes (all safe to re-run with IF NOT EXISTS / DROP CONSTRAINT IF EXISTS):
--   1. availability_type: 'local_stock' | 'import_on_demand'  (commercial flag)
--   2. origin_detail: 'locally_produced' | 'imported_but_in_morocco_stock'
--   3. affiliate_enabled boolean (forced false when import_on_demand)
--   4. confirmation_fee_mad / packaging_fee_mad (operational costs per order)
--   5. media JSONB: [{url, type}] replacing images text[]
--   6. purchase_currency restricted to MAD | USD | AED
--   7. Data migrations (idempotent)
--   8. Indexes
-- =============================================================================

-- ── 1. availability_type ──────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS availability_type text NOT NULL DEFAULT 'local_stock'
    CHECK (availability_type IN ('local_stock', 'import_on_demand'));

-- ── 2. origin_detail (only meaningful when availability_type = 'local_stock') ─
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origin_detail text
    CHECK (origin_detail IN ('locally_produced', 'imported_but_in_morocco_stock'));

-- ── 3. affiliate_enabled ──────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS affiliate_enabled boolean NOT NULL DEFAULT true;

-- ── 4. Operational fees per confirmed order ───────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS confirmation_fee_mad numeric(10,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS packaging_fee_mad    numeric(10,2) NOT NULL DEFAULT 10;

-- ── 5. Structured media (replaces images text[]) ─────────────────────────────
--    Schema: [{url: string, type: 'image'|'video'|'telegram_link'|'external_link'}]
--    The old images[] column is kept for historical data (not dropped).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 6. Data migrations ───────────────────────────────────────────────────────

-- 6a. Map source_type → availability_type + origin_detail for existing rows
--     All existing products were already in Morocco stock.
UPDATE public.products
SET
  availability_type = 'local_stock',
  origin_detail = CASE
    WHEN source_type = 'imported' THEN 'imported_but_in_morocco_stock'
    ELSE 'locally_produced'
  END
WHERE origin_detail IS NULL;

-- 6b. Migrate images text[] → media JSONB (only rows with images and empty media)
UPDATE public.products
SET media = (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('url', img, 'type', 'image')),
    '[]'::jsonb
  )
  FROM unnest(images) AS img
  WHERE img IS NOT NULL AND img <> ''
)
WHERE images IS NOT NULL
  AND array_length(images, 1) > 0
  AND media = '[]'::jsonb;

-- 6c. Enforce import_on_demand → affiliate_enabled = false
UPDATE public.products
  SET affiliate_enabled = false
  WHERE availability_type = 'import_on_demand';

-- 6d. Fix any currencies outside the allowed set
UPDATE public.products
  SET purchase_currency = 'MAD'
  WHERE purchase_currency NOT IN ('MAD', 'USD', 'AED');

-- ── 7. Update purchase_currency CHECK constraint ──────────────────────────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_purchase_currency_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_purchase_currency_check
  CHECK (purchase_currency IN ('MAD', 'USD', 'AED'));

-- ── 8. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_availability_type
  ON public.products (availability_type);

CREATE INDEX IF NOT EXISTS idx_products_affiliate_enabled
  ON public.products (affiliate_enabled, active)
  WHERE affiliate_enabled = true AND active = true;
