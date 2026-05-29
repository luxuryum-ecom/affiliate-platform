-- ─── 022 Import Tariffs — Shipping Modes ────────────────────────────────────
-- Replaces the generic pricing_mode/price_mad fields with explicit shipping
-- modes (air_door_to_door_kg | sea_textile_kg | sea_volume_cbm) and renames
-- the cost field to transport_customs_price_mad for semantic clarity.
-- Adds import_shipping_mode to products for global tariff lookup.
-- Adds a partial unique index: one active tariff per (country, shipping_mode).

-- ─── 1. import_tariffs — add shipping_mode ───────────────────────────────────

ALTER TABLE import_tariffs ADD COLUMN IF NOT EXISTS shipping_mode text;

-- Drop old check constraint (idempotent — ignore if already absent)
DO $$
BEGIN
  ALTER TABLE import_tariffs DROP CONSTRAINT import_tariffs_pricing_mode_check;
EXCEPTION WHEN undefined_object THEN NULL;
END;
$$;

-- Migrate existing data: map old pricing_mode values to new shipping_mode
UPDATE import_tariffs
SET shipping_mode = CASE
  WHEN pricing_mode = 'door_to_door_per_kg'                           THEN 'air_door_to_door_kg'
  WHEN pricing_mode = 'sea_freight_cbm_or_kg' AND unit = 'cbm'       THEN 'sea_volume_cbm'
  WHEN pricing_mode = 'sea_freight_cbm_or_kg'                         THEN 'sea_textile_kg'
  ELSE 'air_door_to_door_kg'
END
WHERE shipping_mode IS NULL;

-- Fallback: ensure no NULL remains before setting NOT NULL
UPDATE import_tariffs SET shipping_mode = 'air_door_to_door_kg' WHERE shipping_mode IS NULL;
ALTER TABLE import_tariffs ALTER COLUMN shipping_mode SET NOT NULL;

-- Add check constraint for shipping_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'import_tariffs' AND constraint_name = 'import_tariffs_shipping_mode_check'
  ) THEN
    ALTER TABLE import_tariffs ADD CONSTRAINT import_tariffs_shipping_mode_check
      CHECK (shipping_mode IN ('air_door_to_door_kg', 'sea_textile_kg', 'sea_volume_cbm'));
  END IF;
END;
$$;

-- ─── 2. import_tariffs — add transport_customs_price_mad ─────────────────────

ALTER TABLE import_tariffs ADD COLUMN IF NOT EXISTS transport_customs_price_mad numeric;

-- Migrate existing price_mad values
UPDATE import_tariffs
SET transport_customs_price_mad = price_mad
WHERE transport_customs_price_mad IS NULL;

UPDATE import_tariffs SET transport_customs_price_mad = 0 WHERE transport_customs_price_mad IS NULL;
ALTER TABLE import_tariffs ALTER COLUMN transport_customs_price_mad SET NOT NULL;

-- ─── 3. import_tariffs — auto-derive unit from shipping_mode ─────────────────

UPDATE import_tariffs
SET unit = CASE
  WHEN shipping_mode = 'sea_volume_cbm' THEN 'cbm'
  ELSE 'kg'
END
WHERE unit IS NULL OR unit NOT IN ('kg', 'cbm');

-- ─── 4. Deduplicate before unique index ──────────────────────────────────────
-- Keep only the most recent active tariff per (country, shipping_mode).
-- This handles cases where the pricing_mode migration produced duplicates.

UPDATE import_tariffs t1
SET active = false
WHERE active = true
  AND EXISTS (
    SELECT 1 FROM import_tariffs t2
    WHERE t2.country    = t1.country
      AND t2.shipping_mode = t1.shipping_mode
      AND t2.active = true
      AND t2.created_at > t1.created_at
  );

-- ─── 5. Partial unique index — one active tariff per country + shipping_mode ──

CREATE UNIQUE INDEX IF NOT EXISTS import_tariffs_active_country_mode_uidx
  ON import_tariffs (country, shipping_mode) WHERE (active = true);

-- ─── 5. products — add import_shipping_mode ──────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS import_shipping_mode text;

-- Migrate existing import_pricing_mode values
UPDATE products
SET import_shipping_mode = CASE
  WHEN import_pricing_mode = 'door_to_door_per_kg'                            THEN 'air_door_to_door_kg'
  WHEN import_pricing_mode = 'sea_freight_cbm_or_kg' AND import_price_unit = 'cbm' THEN 'sea_volume_cbm'
  WHEN import_pricing_mode = 'sea_freight_cbm_or_kg'                          THEN 'sea_textile_kg'
  ELSE NULL
END
WHERE import_shipping_mode IS NULL AND import_pricing_mode IS NOT NULL;

-- Check constraint for products.import_shipping_mode (nullable — only set for import_on_demand)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products' AND constraint_name = 'products_import_shipping_mode_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_import_shipping_mode_check
      CHECK (import_shipping_mode IS NULL OR
             import_shipping_mode IN ('air_door_to_door_kg', 'sea_textile_kg', 'sea_volume_cbm'));
  END IF;
END;
$$;
