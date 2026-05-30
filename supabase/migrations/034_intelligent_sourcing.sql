-- =============================================================================
-- Migration: 034_intelligent_sourcing (idempotent — safe to re-run)
-- Adds sourcing_requests table for wholesaler→admin intelligent matching flow.
-- Supplier identity is never exposed to wholesalers via RLS.
-- =============================================================================

-- ── 1. sourcing_requests table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sourcing_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- What the wholesaler needs
  product_name          text        NOT NULL,
  category              text        NOT NULL,
  quantity              integer     NOT NULL CHECK (quantity > 0),
  target_budget_mad     numeric(12,2) NOT NULL CHECK (target_budget_mad > 0),
  target_country        text,
  delivery_deadline     date,
  notes                 text,

  -- Admin workflow
  status                text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'matching', 'matched', 'quoted', 'closed')),
  admin_notes           text,

  -- Selected supplier (admin picks, hidden from wholesaler)
  selected_supplier_id  uuid        REFERENCES public.profiles(id),

  -- Resulting quote_request (if admin converts to quote)
  quote_request_id      uuid        REFERENCES public.quote_requests(id),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sr_wholesaler_id  ON public.sourcing_requests(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_sr_status         ON public.sourcing_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_category       ON public.sourcing_requests(category);
CREATE INDEX IF NOT EXISTS idx_sr_created_at     ON public.sourcing_requests(created_at DESC);

-- ── 2. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sourcing_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sourcing_request_updated_at ON public.sourcing_requests;
CREATE TRIGGER trg_sourcing_request_updated_at
  BEFORE UPDATE ON public.sourcing_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_sourcing_request_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.sourcing_requests ENABLE ROW LEVEL SECURITY;

-- Wholesaler can see and create their own requests (selected_supplier_id is hidden via column)
DROP POLICY IF EXISTS "sr: wholesaler own read" ON public.sourcing_requests;
CREATE POLICY "sr: wholesaler own read"
  ON public.sourcing_requests FOR SELECT TO authenticated
  USING (wholesaler_id = auth.uid() AND public.my_role() = 'wholesaler');

DROP POLICY IF EXISTS "sr: wholesaler insert" ON public.sourcing_requests;
CREATE POLICY "sr: wholesaler insert"
  ON public.sourcing_requests FOR INSERT TO authenticated
  WITH CHECK (wholesaler_id = auth.uid() AND public.my_role() = 'wholesaler');

-- Admin has full access
DROP POLICY IF EXISTS "sr: admin all" ON public.sourcing_requests;
CREATE POLICY "sr: admin all"
  ON public.sourcing_requests FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
