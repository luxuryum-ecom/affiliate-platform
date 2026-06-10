-- =============================================================================
-- Migration 011 — Affiliate custom sell price per product
-- (idempotent — safe to re-run)
-- =============================================================================
-- Affiliates can define a custom sell price per product.
-- Minimum: must be >= product.sell_price (enforced at application layer).
-- Commission at order time = (custom_price − platform_sell_price + commission_amount) × qty.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.affiliate_product_prices (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id          uuid          NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  product_id            uuid          NOT NULL REFERENCES public.products(id)  ON DELETE CASCADE,
  custom_sell_price_mad numeric(10,2) NOT NULL CHECK (custom_sell_price_mad > 0),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_product_prices_unique_pair UNIQUE (affiliate_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_aff_prices_affiliate
  ON public.affiliate_product_prices(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_aff_prices_product
  ON public.affiliate_product_prices(product_id);

ALTER TABLE public.affiliate_product_prices ENABLE ROW LEVEL SECURITY;

-- Affiliates manage their own rows
DROP POLICY IF EXISTS "aff_prices: affiliate manage own" ON public.affiliate_product_prices;
CREATE POLICY "aff_prices: affiliate manage own"
  ON public.affiliate_product_prices FOR ALL TO authenticated
  USING   (affiliate_id = auth.uid())
  WITH CHECK (affiliate_id = auth.uid());

-- Admins and agents read all
DROP POLICY IF EXISTS "aff_prices: admin read" ON public.affiliate_product_prices;
CREATE POLICY "aff_prices: admin read"
  ON public.affiliate_product_prices FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

-- Anon can read (needed for the public product page running without session)
DROP POLICY IF EXISTS "aff_prices: anon read" ON public.affiliate_product_prices;
CREATE POLICY "aff_prices: anon read"
  ON public.affiliate_product_prices FOR SELECT TO anon
  USING (true);

-- Auto-update updated_at on change
DROP TRIGGER IF EXISTS trg_aff_prices_updated_at ON public.affiliate_product_prices;
CREATE TRIGGER trg_aff_prices_updated_at
  BEFORE UPDATE ON public.affiliate_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
