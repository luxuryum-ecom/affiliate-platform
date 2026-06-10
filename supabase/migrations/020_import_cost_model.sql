-- Migration 020: import cost model for import_on_demand products
-- Adds structured import pricing fields:
--   import_pricing_mode  — 'door_to_door_per_kg' | 'sea_freight_cbm_or_kg'
--   estimated_import_price_mad — replaces the generic estimated_cost_mad for display
--   import_price_unit    — 'kg' | 'cbm' (unit corresponding to pricing mode)
--   import_notes         — optional notes; important/recommended when origin = 'Mixte'
-- origin_country already exists (migration 003); no DB changes needed for origin values.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS import_pricing_mode       text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_import_price_mad numeric(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_price_unit          text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_notes               text           DEFAULT NULL;

-- Idempotent CHECK constraints
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_import_pricing_mode_check;
ALTER TABLE products
  ADD CONSTRAINT products_import_pricing_mode_check
  CHECK (
    import_pricing_mode IS NULL OR
    import_pricing_mode IN ('door_to_door_per_kg', 'sea_freight_cbm_or_kg')
  );

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_import_price_unit_check;
ALTER TABLE products
  ADD CONSTRAINT products_import_price_unit_check
  CHECK (import_price_unit IS NULL OR import_price_unit IN ('kg', 'cbm'));

COMMENT ON COLUMN products.import_pricing_mode IS
  'Import pricing model: door_to_door_per_kg or sea_freight_cbm_or_kg. Only for import_on_demand.';
COMMENT ON COLUMN products.estimated_import_price_mad IS
  'Estimated import cost in MAD per unit (per kg or per cbm depending on import_price_unit). Only for import_on_demand.';
COMMENT ON COLUMN products.import_price_unit IS
  'Unit used for estimated_import_price_mad: kg or cbm. Only for import_on_demand.';
COMMENT ON COLUMN products.import_notes IS
  'Optional import notes shown to wholesalers. Recommended when origin_country = Mixte.';
