-- Migration 044: Supplier product moderation workflow (pending_review + AI flags)

-- ── 1. Extend approval_status + migrate legacy values ───────────────────────

ALTER TABLE public.supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_approval_status_check;

UPDATE public.supplier_products
SET approval_status = 'pending_review'
WHERE approval_status IN ('pending', 'pending_review');

UPDATE public.supplier_products
SET approval_status = 'blocked'
WHERE approval_status IN ('rejected', 'blocked');

ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_approval_status_check
  CHECK (approval_status IN ('pending_review', 'approved', 'blocked'));

ALTER TABLE public.supplier_products
  ALTER COLUMN approval_status SET DEFAULT 'pending_review';

-- ── 2. AI moderation columns (admin-visible; not in supplier SELECT lists) ───

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS moderation_flag text,
  ADD COLUMN IF NOT EXISTS ai_risk_score integer,
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderation_signals text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_moderation_flag_check;

ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_moderation_flag_check
  CHECK (
    moderation_flag IS NULL
    OR moderation_flag IN ('approved', 'review_required', 'blocked')
  );

ALTER TABLE public.supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_ai_risk_score_check;

ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_ai_risk_score_check
  CHECK (ai_risk_score IS NULL OR (ai_risk_score >= 0 AND ai_risk_score <= 100));

CREATE INDEX IF NOT EXISTS idx_sp_moderation_flag ON public.supplier_products(moderation_flag);
CREATE INDEX IF NOT EXISTS idx_sp_ai_risk_score ON public.supplier_products(ai_risk_score DESC);

-- ── 3. Supplier may edit only while pending_review ───────────────────────────

DROP POLICY IF EXISTS "supplier_products: supplier update own pending" ON public.supplier_products;
CREATE POLICY "supplier_products: supplier update own pending"
  ON public.supplier_products FOR UPDATE TO authenticated
  USING (supplier_id = auth.uid() AND approval_status = 'pending_review')
  WITH CHECK (supplier_id = auth.uid() AND approval_status = 'pending_review');
