-- ─── Link wholesale_orders ↔ quote_requests ─────────────────────────────────
-- Adds nullable FK so an order created from a quote can be traced back.
-- Additive only — existing orders get NULL (no data destruction).

ALTER TABLE wholesale_orders
  ADD COLUMN IF NOT EXISTS quote_request_id uuid REFERENCES quote_requests(id);

CREATE INDEX IF NOT EXISTS wholesale_orders_quote_request_id_idx
  ON wholesale_orders (quote_request_id)
  WHERE quote_request_id IS NOT NULL;
