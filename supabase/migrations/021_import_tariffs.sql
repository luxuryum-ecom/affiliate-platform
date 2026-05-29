-- ─── 021 Import Tariffs ───────────────────────────────────────────────────────
-- Centralized per-country import tariffs table.
-- Adds tariff_mode ('global' | 'custom') to products so admins can either
-- inherit rates from import_tariffs or set custom rates per product.

-- ─── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_tariffs (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country       text        NOT NULL,
  pricing_mode  text        NOT NULL,
  price_mad     numeric     NOT NULL,
  unit          text        NOT NULL,
  delivery_days integer,
  notes         text,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- CHECK constraints (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'import_tariffs' AND constraint_name = 'import_tariffs_country_check'
  ) THEN
    ALTER TABLE import_tariffs ADD CONSTRAINT import_tariffs_country_check
      CHECK (country IN ('Turquie', 'Chine', 'Égypte', 'Dubai', 'Autre'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'import_tariffs' AND constraint_name = 'import_tariffs_pricing_mode_check'
  ) THEN
    ALTER TABLE import_tariffs ADD CONSTRAINT import_tariffs_pricing_mode_check
      CHECK (pricing_mode IN ('door_to_door_per_kg', 'sea_freight_cbm_or_kg'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'import_tariffs' AND constraint_name = 'import_tariffs_unit_check'
  ) THEN
    ALTER TABLE import_tariffs ADD CONSTRAINT import_tariffs_unit_check
      CHECK (unit IN ('kg', 'cbm'));
  END IF;
END;
$$;

-- ─── 2. updated_at trigger ────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_import_tariffs_updated_at ON import_tariffs;
CREATE TRIGGER set_import_tariffs_updated_at
  BEFORE UPDATE ON import_tariffs
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE import_tariffs ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
DROP POLICY IF EXISTS "admin_all_import_tariffs" ON import_tariffs;
CREATE POLICY "admin_all_import_tariffs" ON import_tariffs
  FOR ALL TO authenticated
  USING (my_role() = 'admin')
  WITH CHECK (my_role() = 'admin');

-- Authenticated users: read active rows (for wholesale product pages)
DROP POLICY IF EXISTS "authenticated_read_active_import_tariffs" ON import_tariffs;
CREATE POLICY "authenticated_read_active_import_tariffs" ON import_tariffs
  FOR SELECT TO authenticated
  USING (active = true);

-- ─── 4. tariff_mode column on products ───────────────────────────────────────
-- 'global'  → inherit pricing from import_tariffs by origin_country (default)
-- 'custom'  → use the product's own import_pricing_mode / estimated_import_price_mad fields

ALTER TABLE products ADD COLUMN IF NOT EXISTS tariff_mode text NOT NULL DEFAULT 'global';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'products' AND constraint_name = 'products_tariff_mode_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_tariff_mode_check
      CHECK (tariff_mode IN ('global', 'custom'));
  END IF;
END;
$$;
