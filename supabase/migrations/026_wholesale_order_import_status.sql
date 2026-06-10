-- migration 026: import progress tracking for wholesale orders
-- Adds import_status column + audit history table.
-- Safe to re-run (idempotent).

-- ── 1. Add import_status to wholesale_orders ─────────────────────────────────

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS import_status text
    CHECK (import_status IN (
      'awaiting_supplier',
      'purchased',
      'in_production',
      'ready_to_ship',
      'shipped',
      'customs_clearance',
      'delivered'
    ));

-- ── 2. History table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wholesale_order_import_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
  import_status text        NOT NULL
    CHECK (import_status IN (
      'awaiting_supplier',
      'purchased',
      'in_production',
      'ready_to_ship',
      'shipped',
      'customs_clearance',
      'delivered'
    )),
  changed_by    uuid        REFERENCES auth.users(id),
  notes         text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_import_history_order
  ON wholesale_order_import_history(order_id, changed_at DESC);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE wholesale_order_import_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_import_history" ON wholesale_order_import_history;
CREATE POLICY "admin_all_import_history"
  ON wholesale_order_import_history
  FOR ALL
  USING (my_role() = 'admin');

DROP POLICY IF EXISTS "buyer_read_import_history" ON wholesale_order_import_history;
CREATE POLICY "buyer_read_import_history"
  ON wholesale_order_import_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wholesale_orders wo
      WHERE wo.id = order_id
        AND wo.buyer_id = auth.uid()
    )
  );
