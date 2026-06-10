-- ─── Migration 025: Wholesale order import cost tracking ─────────────────────
-- Adds 3 input cost columns + a BEFORE trigger that auto-computes total_cost_mad,
-- gross_profit_mad and gross_margin_percent on every INSERT / UPDATE.
-- Fully additive — no data destruction.

-- 1. Input cost columns (admin fills these in)
ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS supplier_cost_mad          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_customs_cost_mad numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_cost_mad        numeric(12,2) NOT NULL DEFAULT 0;

-- 2. Computed output columns (written by trigger; nullable until first save)
ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS total_cost_mad        numeric(12,2),
  ADD COLUMN IF NOT EXISTS gross_profit_mad      numeric(12,2),
  ADD COLUMN IF NOT EXISTS gross_margin_percent  numeric(8,2);

-- 3. Trigger function
CREATE OR REPLACE FUNCTION compute_wholesale_order_costs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_cost_mad :=
    COALESCE(NEW.supplier_cost_mad, 0)
    + COALESCE(NEW.transport_customs_cost_mad, 0)
    + COALESCE(NEW.additional_cost_mad, 0);

  NEW.gross_profit_mad := NEW.total_amount - NEW.total_cost_mad;

  NEW.gross_margin_percent := CASE
    WHEN NEW.total_amount > 0 THEN
      ROUND((NEW.gross_profit_mad / NEW.total_amount) * 100, 2)
    ELSE 0
  END;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger (idempotent)
DROP TRIGGER IF EXISTS wholesale_order_costs_tg ON wholesale_orders;
CREATE TRIGGER wholesale_order_costs_tg
  BEFORE INSERT OR UPDATE ON wholesale_orders
  FOR EACH ROW EXECUTE FUNCTION compute_wholesale_order_costs();

-- 5. Backfill existing rows — trigger will compute all derived columns
UPDATE wholesale_orders
SET supplier_cost_mad = COALESCE(supplier_cost_mad, 0);
