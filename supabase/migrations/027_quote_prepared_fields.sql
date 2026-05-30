-- ─── Quote Prepared: structured quote document fields ────────────────────────
-- Adds quote_prepared status and admin-fillable columns for the formal quote.
-- All changes are additive — no existing rows or constraints are destroyed.

-- 1. Extend status CHECK to include 'quote_prepared'
--    Drop the unnamed inline CHECK and replace with a named constraint so it
--    can be safely dropped/re-added idempotently.
ALTER TABLE quote_requests
  DROP CONSTRAINT IF EXISTS quote_requests_status_check;

ALTER TABLE quote_requests
  ADD CONSTRAINT quote_requests_status_check
  CHECK (status IN (
    'new', 'studying', 'quoted', 'quote_prepared',
    'negotiating', 'approved', 'rejected', 'converted_to_order'
  ));

-- 2. Structured quote document columns (all nullable — existing rows unaffected)
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS quoted_unit_price_mad      numeric(12,2),
  ADD COLUMN IF NOT EXISTS quoted_quantity            integer,
  ADD COLUMN IF NOT EXISTS quoted_transport_total_mad numeric(12,2),
  ADD COLUMN IF NOT EXISTS quoted_shipping_mode       text,
  ADD COLUMN IF NOT EXISTS quoted_delivery_delay      text,
  ADD COLUMN IF NOT EXISTS quote_validity_date        date,
  ADD COLUMN IF NOT EXISTS quote_public_note          text,
  ADD COLUMN IF NOT EXISTS quote_prepared_at          timestamptz;
