-- =============================================================================
-- Migration 005 — Proof/receipt schema · Search indexes
-- (idempotent — safe to re-run)
-- =============================================================================

-- =============================================================================
-- 1. ORDER PROOFS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_proofs (
  id                         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_type                 text        NOT NULL
                                         CHECK (proof_type IN (
                                           'bank_receipt',
                                           'transfer_proof',
                                           'delivery_receipt',
                                           'return_receipt',
                                           'stock_reception_proof',
                                           'other'
                                         )),
  file_url                   text        NOT NULL,
  uploaded_by                uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  related_order_id           uuid        REFERENCES public.orders(id) ON DELETE CASCADE,
  related_wholesale_order_id uuid        REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  related_product_id         uuid        REFERENCES public.products(id) ON DELETE CASCADE,
  notes                      text,
  uploaded_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_proofs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_proofs_order_id
  ON public.order_proofs(related_order_id) WHERE related_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proofs_wo_id
  ON public.order_proofs(related_wholesale_order_id) WHERE related_wholesale_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proofs_product_id
  ON public.order_proofs(related_product_id) WHERE related_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proofs_uploaded_by
  ON public.order_proofs(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_proofs_uploaded_at
  ON public.order_proofs(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_type
  ON public.order_proofs(proof_type);

DROP POLICY IF EXISTS "proofs: admin full access" ON public.order_proofs;
CREATE POLICY "proofs: admin full access"
  ON public.order_proofs FOR ALL TO authenticated
  USING  (public.my_role() IN ('admin', 'agent'))
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

DROP POLICY IF EXISTS "proofs: affiliates read own order proofs" ON public.order_proofs;
CREATE POLICY "proofs: affiliates read own order proofs"
  ON public.order_proofs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = related_order_id
        AND o.affiliate_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "proofs: buyers read own wholesale proofs" ON public.order_proofs;
CREATE POLICY "proofs: buyers read own wholesale proofs"
  ON public.order_proofs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = related_wholesale_order_id
        AND wo.buyer_id = auth.uid()
    )
  );

-- =============================================================================
-- 2. SEARCH OPTIMIZATION INDEXES
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_supplier_trgm
  ON public.products USING GIN (supplier_name gin_trgm_ops) WHERE supplier_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm
  ON public.orders USING GIN (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm
  ON public.orders USING GIN (customer_phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_low_stock
  ON public.products (stock_count) WHERE stock_count < 5 AND active = true;
