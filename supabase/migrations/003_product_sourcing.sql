-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Product sourcing, traceability and pricing logic
-- Day 2 correction: adds full sourcing lineage so every product record
-- captures who submitted it, where it comes from, what it costs, and who
-- approved it. Designed to accept future Telegram / supplier submissions
-- without any schema changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE public.products
  -- Replaces the old two-value 'type' column with finer-grained source_type
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'local_production'
    CHECK (source_type IN ('local_production', 'imported')),

  -- Supplier identity (denormalised name; supplier_id reserved for a future
  -- dedicated suppliers table)
  ADD COLUMN IF NOT EXISTS supplier_id   uuid,
  ADD COLUMN IF NOT EXISTS supplier_name text,

  -- Geographic traceability
  ADD COLUMN IF NOT EXISTS origin_country text,

  -- Submission audit trail
  ADD COLUMN IF NOT EXISTS submitted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_via text NOT NULL DEFAULT 'admin_dashboard'
    CHECK (submitted_via IN ('admin_dashboard', 'telegram_future', 'supplier_future')),

  -- Cost / pricing inputs
  ADD COLUMN IF NOT EXISTS purchase_price       numeric(10,2),
  ADD COLUMN IF NOT EXISTS purchase_currency    text    NOT NULL DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_mad numeric(10,4) NOT NULL DEFAULT 1,

  -- Computed & stored for audit — server calculates, DB stores for history
  ADD COLUMN IF NOT EXISTS purchase_price_mad          numeric(10,2),
  ADD COLUMN IF NOT EXISTS margin_percentage           numeric(5,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS calculated_sale_price_mad   numeric(10,2),

  -- Submission notes from supplier / agent
  ADD COLUMN IF NOT EXISTS source_notes text,

  -- Approval workflow
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz;

-- ── 2. Migrate old 'type' (local | imported) → source_type ───────────────────
--    Run only if the old column still exists; safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'products'
      AND column_name  = 'type'
  ) THEN
    UPDATE public.products
       SET source_type = CASE WHEN type = 'imported' THEN 'imported' ELSE 'local_production' END;

    ALTER TABLE public.products DROP COLUMN type;
  END IF;
END;
$$;

-- ── 3. Grandfather existing products into 'approved' status ──────────────────
--    Products created before this workflow existed skip the review queue.

UPDATE public.products
   SET approval_status = 'approved'
 WHERE approval_status = 'draft';

-- ── 4. Indexes for common filter queries ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_source_type
  ON public.products (source_type);

CREATE INDEX IF NOT EXISTS idx_products_approval_status
  ON public.products (approval_status);

CREATE INDEX IF NOT EXISTS idx_products_origin_country
  ON public.products (origin_country)
  WHERE origin_country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_submitted_by
  ON public.products (submitted_by)
  WHERE submitted_by IS NOT NULL;

-- ── Notes for future Telegram / supplier intake ───────────────────────────────
-- When a product arrives from Telegram:
--   submitted_via  = 'telegram_future'
--   submitted_by   = Telegram agent's profile UUID
--   approval_status defaults to 'draft' or 'pending_review'
--   active         = false  (cannot be activated until approval_status = 'approved')
--
-- Business rules enforced at application layer (upsertProduct action):
--   1. purchase_price_mad = IF source_type = 'local_production'
--                               THEN purchase_price
--                               ELSE purchase_price * exchange_rate_to_mad
--   2. calculated_sale_price_mad = purchase_price_mad * (1 + margin_percentage / 100)
--   3. active must be false when approval_status != 'approved'
--   4. approved_by and approved_at are set by the action when status → 'approved'
