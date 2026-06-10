-- ─── Migration 029: Wholesale payment tracking ───────────────────────────────
-- Adds payment status, deposit amounts, and a payment history audit table
-- to wholesale orders. Internal tracking only — no payment gateway.

-- ─── 1. Payment status columns on wholesale_orders ───────────────────────────

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'no_deposit'
    CHECK (payment_status IN ('no_deposit', 'deposit_requested', 'deposit_received', 'fully_paid'));

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) NULL;

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS deposit_received_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS deposit_requested_at TIMESTAMPTZ NULL;

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS deposit_received_at TIMESTAMPTZ NULL;

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS fully_paid_at TIMESTAMPTZ NULL;

-- ─── 2. Payment history audit table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wholesale_order_payment_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES wholesale_orders(id) ON DELETE CASCADE,
  payment_status          TEXT NOT NULL
    CHECK (payment_status IN ('no_deposit', 'deposit_requested', 'deposit_received', 'fully_paid')),
  deposit_amount          NUMERIC(10,2) NULL,
  deposit_received_amount NUMERIC(10,2) NULL,
  changed_by              UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                   TEXT NULL,
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_payment_history_order_id
  ON wholesale_order_payment_history(order_id);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE wholesale_order_payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_payment_history" ON wholesale_order_payment_history;
CREATE POLICY "admin_all_payment_history"
  ON wholesale_order_payment_history
  FOR ALL
  TO authenticated
  USING (my_role() = 'admin')
  WITH CHECK (my_role() = 'admin');

-- Wholesaler buyers can read payment history for their own orders
DROP POLICY IF EXISTS "buyer_read_payment_history" ON wholesale_order_payment_history;
CREATE POLICY "buyer_read_payment_history"
  ON wholesale_order_payment_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM wholesale_orders o
      WHERE o.id = order_id
        AND o.buyer_id = auth.uid()
    )
  );
