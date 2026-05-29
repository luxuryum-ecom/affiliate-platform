-- =============================================================================
-- Migration 018 — Wholesale access flag + invoice request fields
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. profiles.wholesale_access — grants wholesale access to non-wholesaler
--      roles (e.g. affiliates who also do B2B). Default false.
--   2. wholesale_orders invoice fields — track per-order invoice requests
--      without a separate table. Fields are nullable until requested.
-- =============================================================================

-- ── 1. profiles.wholesale_access ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wholesale_access boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.profiles.wholesale_access IS
  'When true, grants access to wholesale features regardless of role. '
  'Allows a user to be both affiliate and wholesaler simultaneously. '
  'Set by admin via the profiles table directly.';

-- ── 2. wholesale_orders — invoice request fields ──────────────────────────────

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS invoice_requested boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS invoice_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_company_name text,
  ADD COLUMN IF NOT EXISTS invoice_ice text,
  ADD COLUMN IF NOT EXISTS invoice_registre_commerce text,
  ADD COLUMN IF NOT EXISTS invoice_billing_address text;

COMMENT ON COLUMN public.wholesale_orders.invoice_requested IS
  'True when the buyer has submitted an invoice request for this order.';

COMMENT ON COLUMN public.wholesale_orders.invoice_requested_at IS
  'Timestamp when the invoice was requested. Null until requested.';

COMMENT ON COLUMN public.wholesale_orders.invoice_company_name IS
  'Company name for the invoice — may differ from profile billing fields.';

COMMENT ON COLUMN public.wholesale_orders.invoice_ice IS
  'ICE (Identifiant Commun de l''Entreprise) for this invoice.';

COMMENT ON COLUMN public.wholesale_orders.invoice_registre_commerce IS
  'Registre de commerce number for this invoice.';

COMMENT ON COLUMN public.wholesale_orders.invoice_billing_address IS
  'Billing address for this invoice.';
