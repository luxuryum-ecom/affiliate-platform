-- =============================================================================
-- Migration 010: drop duplicate on_order_delivered trigger
-- =============================================================================
-- Migration 001 created on_order_delivered (fires on ANY column update).
-- Migration 009 created trg_order_delivered (fires only on UPDATE OF status).
-- Both execute the same handle_order_delivered() function, causing it to run
-- twice per status change. ON CONFLICT DO NOTHING in the function body prevents
-- double commission rows, but the double execution is wasteful and fragile for
-- any future logic added to the function.
-- Keeping: trg_order_delivered (scoped to UPDATE OF status — correct behaviour)
-- Dropping: on_order_delivered (over-broad, superseded by migration 009)
-- =============================================================================

DROP TRIGGER IF EXISTS on_order_delivered ON public.orders;
