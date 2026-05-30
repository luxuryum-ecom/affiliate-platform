-- =============================================================================
-- Migration: 030_supplier_marketplace (idempotent — safe to re-run)
-- Adds supplier role + supplier_products table + wholesale marketplace support
-- =============================================================================

-- ── 1. Extend profiles.role CHECK to include 'supplier' ──────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'affiliate', 'wholesaler', 'agent', 'supplier'));

-- ── 2. Create supplier_products table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_products (
  id                          uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Supplier identity (internal — never exposed to wholesalers)
  supplier_id                 uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Submission fields (as submitted by supplier)
  product_name                text          NOT NULL,
  category                    text          NOT NULL DEFAULT '',
  niche                       text          NOT NULL DEFAULT '',
  description                 text,
  photos                      text[]        NOT NULL DEFAULT '{}',
  min_quantity                integer       NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  origin_country              text          NOT NULL DEFAULT '',
  availability_type           text          NOT NULL DEFAULT 'local_stock'
                              CHECK (availability_type IN ('local_stock', 'import_on_demand')),
  target_buyer_type           text          NOT NULL DEFAULT 'wholesaler'
                              CHECK (target_buyer_type IN ('wholesaler', 'both')),
  suggested_wholesale_price_mad numeric(10,2),
  supplier_private_notes      text,

  -- Approval workflow
  approval_status             text          NOT NULL DEFAULT 'pending'
                              CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  admin_notes                 text,
  approved_by                 uuid          REFERENCES public.profiles(id),
  approved_at                 timestamptz,
  rejected_at                 timestamptz,

  -- Admin-editable public fields (set after review)
  public_name                 text,
  public_description          text,

  -- Platform margin (admin-set)
  platform_margin_type        text          NOT NULL DEFAULT 'percentage'
                              CHECK (platform_margin_type IN ('percentage', 'fixed')),
  platform_margin_value       numeric(10,2),

  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now()
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sp_supplier_id      ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sp_approval_status  ON public.supplier_products(approval_status);
CREATE INDEX IF NOT EXISTS idx_sp_availability     ON public.supplier_products(availability_type);
CREATE INDEX IF NOT EXISTS idx_sp_origin_country   ON public.supplier_products(origin_country);
CREATE INDEX IF NOT EXISTS idx_sp_created_at       ON public.supplier_products(created_at DESC);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS supplier_products_updated_at ON public.supplier_products;
CREATE TRIGGER supplier_products_updated_at
  BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. Add supplier_product_id to quote_requests (nullable, for marketplace quotes) ──

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS supplier_product_id uuid REFERENCES public.supplier_products(id);

CREATE INDEX IF NOT EXISTS idx_qr_supplier_product_id
  ON public.quote_requests(supplier_product_id);

-- ── 6. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

-- Supplier can read their own submissions
DROP POLICY IF EXISTS "supplier_products: supplier read own" ON public.supplier_products;
CREATE POLICY "supplier_products: supplier read own"
  ON public.supplier_products FOR SELECT TO authenticated
  USING (
    supplier_id = auth.uid()
    OR public.my_role() = 'admin'
  );

-- Supplier can insert their own submissions
DROP POLICY IF EXISTS "supplier_products: supplier insert" ON public.supplier_products;
CREATE POLICY "supplier_products: supplier insert"
  ON public.supplier_products FOR INSERT TO authenticated
  WITH CHECK (
    supplier_id = auth.uid()
    AND public.my_role() = 'supplier'
  );

-- Supplier can update own pending submissions
DROP POLICY IF EXISTS "supplier_products: supplier update own pending" ON public.supplier_products;
CREATE POLICY "supplier_products: supplier update own pending"
  ON public.supplier_products FOR UPDATE TO authenticated
  USING (supplier_id = auth.uid() AND approval_status = 'pending')
  WITH CHECK (supplier_id = auth.uid());

-- Admin can update any supplier product
DROP POLICY IF EXISTS "supplier_products: admin update" ON public.supplier_products;
CREATE POLICY "supplier_products: admin update"
  ON public.supplier_products FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- Wholesalers can read approved supplier products (identity excluded at query level)
DROP POLICY IF EXISTS "supplier_products: wholesaler read approved" ON public.supplier_products;
CREATE POLICY "supplier_products: wholesaler read approved"
  ON public.supplier_products FOR SELECT TO authenticated
  USING (
    approval_status = 'approved'
    AND (
      public.my_role() = 'wholesaler'
      OR (SELECT wholesale_access FROM public.profiles WHERE id = auth.uid()) = true
    )
  );
