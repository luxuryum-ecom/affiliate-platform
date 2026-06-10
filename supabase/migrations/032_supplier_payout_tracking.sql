-- =============================================================================
-- Migration: 032_supplier_payout_tracking (idempotent — safe to re-run)
-- Adds supplier financial fields to supplier_quote_requests and creates
-- supplier_payout_history for payout audit trail.
-- =============================================================================

-- ── 1. Add financial columns to supplier_quote_requests ──────────────────────

ALTER TABLE public.supplier_quote_requests
  ADD COLUMN IF NOT EXISTS supplier_cost_mad              numeric(10,2),
  ADD COLUMN IF NOT EXISTS platform_commission_type       text NOT NULL DEFAULT 'percent'
    CHECK (platform_commission_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS platform_commission_value      numeric(10,2),
  ADD COLUMN IF NOT EXISTS platform_commission_amount_mad numeric(10,2),
  ADD COLUMN IF NOT EXISTS transport_customs_cost_mad     numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_payout_amount_mad     numeric(10,2),
  ADD COLUMN IF NOT EXISTS supplier_payout_status         text NOT NULL DEFAULT 'not_due'
    CHECK (supplier_payout_status IN ('not_due', 'pending', 'partially_paid', 'paid'));

-- ── 2. Indexes for payout status queries ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sqr_payout_status
  ON public.supplier_quote_requests(supplier_payout_status);

-- ── 3. supplier_payout_history table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_payout_history (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_request_id   uuid        NOT NULL
    REFERENCES public.supplier_quote_requests(id) ON DELETE CASCADE,
  previous_status             text,
  new_status                  text        NOT NULL,
  changed_by                  uuid        REFERENCES public.profiles(id),
  notes                       text,
  changed_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sph_sqr_id
  ON public.supplier_payout_history(supplier_quote_request_id);
CREATE INDEX IF NOT EXISTS idx_sph_changed_at
  ON public.supplier_payout_history(changed_at DESC);

-- ── 4. RLS for supplier_payout_history (admin only) ──────────────────────────

ALTER TABLE public.supplier_payout_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sph: admin all" ON public.supplier_payout_history;
CREATE POLICY "sph: admin all"
  ON public.supplier_payout_history FOR ALL TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 5. Extend supplier_quote_requests RLS: supplier read own-product quotes ───
-- Supplier can see quote requests for their own products.
-- Client identity (buyer_id, whatsapp_number, buyer_notes) must be stripped
-- at the query layer — this policy only enables row access, not column privacy.

DROP POLICY IF EXISTS "sqr: supplier read own products" ON public.supplier_quote_requests;
CREATE POLICY "sqr: supplier read own products"
  ON public.supplier_quote_requests FOR SELECT TO authenticated
  USING (
    public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id
        AND sp.supplier_id = auth.uid()
    )
  );
