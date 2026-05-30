-- Migration 039: Add category and subcategory columns to products table
-- Additive only — safe to re-run (IF NOT EXISTS guards).
-- Also adds subcategory to supplier_products (niche stays, subcategory is structured).

-- products table (admin COD catalog)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subcategory text NOT NULL DEFAULT '';

-- supplier_products table — add structured subcategory alongside free-text niche
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS subcategory text NOT NULL DEFAULT '';

-- Backfill supplier_products.subcategory from niche where niche matches known subcategory values
-- (safe UPDATE — scoped to rows where subcategory is still empty)
UPDATE supplier_products
SET subcategory = niche
WHERE subcategory = ''
  AND niche IS NOT NULL
  AND niche <> '';

-- Index for marketplace filtering performance
CREATE INDEX IF NOT EXISTS idx_products_category          ON products(category);
CREATE INDEX IF NOT EXISTS idx_supplier_products_category ON supplier_products(category);
CREATE INDEX IF NOT EXISTS idx_supplier_products_subcategory ON supplier_products(subcategory);
