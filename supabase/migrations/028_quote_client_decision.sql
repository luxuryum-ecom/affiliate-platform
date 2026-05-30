-- ─── Quote Client Decision ────────────────────────────────────────────────────
-- Adds two new statuses (accepted_by_client, rejected_by_client) to the quote
-- pipeline and a client_decision_at timestamp column.
-- All changes are additive — no existing rows or constraints are destroyed.

-- 1. Extend status CHECK to include the two client-decision states.
--    Drop the named constraint and re-create with the expanded list.
ALTER TABLE quote_requests
  DROP CONSTRAINT IF EXISTS quote_requests_status_check;

ALTER TABLE quote_requests
  ADD CONSTRAINT quote_requests_status_check
  CHECK (status IN (
    'new', 'studying', 'quoted', 'quote_prepared',
    'accepted_by_client', 'rejected_by_client',
    'negotiating', 'approved', 'rejected', 'converted_to_order'
  ));

-- 2. Timestamp column storing when the client made their decision.
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS client_decision_at timestamptz;
