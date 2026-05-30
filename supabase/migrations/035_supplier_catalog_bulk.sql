-- =============================================================================
-- Migration: 035_supplier_catalog_bulk (idempotent — safe to re-run)
-- Adds bulk import, product variants, MOQ tiers, and extended catalog columns.
-- =============================================================================

-- ── 1. Extend supplier_products with new catalog fields ───────────────────────

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS unit                text    NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS stock_quantity      integer CHECK (stock_quantity >= 0),
  ADD COLUMN IF NOT EXISTS lead_time_days      integer CHECK (lead_time_days >= 0),
  ADD COLUMN IF NOT EXISTS export_countries    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supplier_unit_price_usd numeric(10,4),
  ADD COLUMN IF NOT EXISTS archived_at         timestamptz;

-- ── 2. supplier_product_variants ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_product_variants (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid        NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  color               text,
  size                text,
  model               text,
  stock_quantity      integer     CHECK (stock_quantity >= 0),
  price_adjustment_usd numeric(10,4) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spv_product_id ON public.supplier_product_variants(supplier_product_id);

ALTER TABLE public.supplier_product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spv: supplier own" ON public.supplier_product_variants;
CREATE POLICY "spv: supplier own"
  ON public.supplier_product_variants FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spv: admin all" ON public.supplier_product_variants;
CREATE POLICY "spv: admin all"
  ON public.supplier_product_variants FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "spv: wholesaler read approved" ON public.supplier_product_variants;
CREATE POLICY "spv: wholesaler read approved"
  ON public.supplier_product_variants FOR SELECT TO authenticated
  USING (
    public.my_role() IN ('wholesaler', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.approval_status = 'approved'
    )
  );

-- ── 3. supplier_product_moq_tiers ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_product_moq_tiers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid        NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  min_quantity        integer     NOT NULL CHECK (min_quantity > 0),
  unit_price_usd      numeric(10,4) NOT NULL CHECK (unit_price_usd > 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spmt_product_id ON public.supplier_product_moq_tiers(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_spmt_min_qty    ON public.supplier_product_moq_tiers(min_quantity);

ALTER TABLE public.supplier_product_moq_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spmt: supplier own" ON public.supplier_product_moq_tiers;
CREATE POLICY "spmt: supplier own"
  ON public.supplier_product_moq_tiers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spmt: admin all" ON public.supplier_product_moq_tiers;
CREATE POLICY "spmt: admin all"
  ON public.supplier_product_moq_tiers FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "spmt: wholesaler read approved" ON public.supplier_product_moq_tiers;
CREATE POLICY "spmt: wholesaler read approved"
  ON public.supplier_product_moq_tiers FOR SELECT TO authenticated
  USING (
    public.my_role() IN ('wholesaler', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.approval_status = 'approved'
    )
  );

-- ── 4. supplier_bulk_imports ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_bulk_imports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename      text        NOT NULL,
  rows_total    integer     NOT NULL DEFAULT 0,
  rows_valid    integer     NOT NULL DEFAULT 0,
  rows_invalid  integer     NOT NULL DEFAULT 0,
  rows_imported integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'validated', 'imported', 'failed')),
  report        jsonb       NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbi_supplier_id ON public.supplier_bulk_imports(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sbi_status      ON public.supplier_bulk_imports(status);
CREATE INDEX IF NOT EXISTS idx_sbi_created_at  ON public.supplier_bulk_imports(created_at DESC);

ALTER TABLE public.supplier_bulk_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sbi: supplier own" ON public.supplier_bulk_imports;
CREATE POLICY "sbi: supplier own"
  ON public.supplier_bulk_imports FOR ALL TO authenticated
  USING  (supplier_id = auth.uid() AND public.my_role() = 'supplier')
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

DROP POLICY IF EXISTS "sbi: admin all" ON public.supplier_bulk_imports;
CREATE POLICY "sbi: admin all"
  ON public.supplier_bulk_imports FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 5. Index for archived_at on supplier_products ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sp_archived_at ON public.supplier_products(archived_at);
