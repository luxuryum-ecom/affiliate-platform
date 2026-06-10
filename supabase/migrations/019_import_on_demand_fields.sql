-- Migration 019: import_on_demand display fields
-- Adds estimated_cost_mad and estimated_delivery_days to products.
-- These are only meaningful when availability_type = 'import_on_demand'.
-- The existing origin_country column (migration 003) is reused for display.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS estimated_cost_mad   numeric(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_delivery_days integer        DEFAULT NULL;

COMMENT ON COLUMN products.estimated_cost_mad IS
  'Estimated door-to-door import cost in MAD. Populated only for import_on_demand products.';

COMMENT ON COLUMN products.estimated_delivery_days IS
  'Estimated delivery delay in days (door-to-door). Populated only for import_on_demand products.';
