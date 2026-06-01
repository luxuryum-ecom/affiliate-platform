-- =============================================================================
-- Migration: 045_intermediary_read_views (idempotent — safe to re-run)
-- Phase 1 read-boundary: redacted views for supplier↔buyer column privacy.
-- Base-table RLS for cross-role reads is removed; roles read views only.
-- =============================================================================

-- ── 1. Supplier read surface for marketplace quote requests (no buyer PII) ───

CREATE OR REPLACE VIEW public.supplier_quote_requests_supplier_read AS
SELECT
  sqr.id,
  sqr.supplier_product_id,
  sqr.quantity_requested,
  sqr.destination_country,
  sqr.destination_city,
  sqr.status,
  sqr.supplier_payout_amount_mad,
  sqr.supplier_payout_status,
  sqr.created_at,
  sqr.updated_at
FROM public.supplier_quote_requests sqr
WHERE public.my_role() = 'supplier'
  AND EXISTS (
    SELECT 1
    FROM public.supplier_products sp
    WHERE sp.id = sqr.supplier_product_id
      AND sp.supplier_id = auth.uid()
  );

GRANT SELECT ON public.supplier_quote_requests_supplier_read TO authenticated;

COMMENT ON VIEW public.supplier_quote_requests_supplier_read IS
  'Supplier-safe quote rows — excludes buyer_id, whatsapp_number, buyer_notes, intake fields.';

DROP POLICY IF EXISTS "sqr: supplier read own products" ON public.supplier_quote_requests;

-- ── 2. Wholesaler read surface for marketplace catalog (no supplier identity) ─

CREATE OR REPLACE VIEW public.supplier_products_wholesaler_read AS
SELECT
  sp.id,
  sp.product_name,
  sp.category,
  sp.subcategory,
  sp.niche,
  sp.description,
  sp.photos,
  sp.min_quantity,
  sp.origin_country,
  sp.availability_type,
  sp.target_buyer_type,
  sp.suggested_wholesale_price_mad,
  sp.public_name,
  sp.public_description,
  sp.approval_status,
  sp.supplier_type,
  sp.unit,
  sp.stock_quantity,
  sp.lead_time_days,
  sp.export_countries,
  sp.created_at,
  sp.updated_at,
  sp.archived_at,
  COALESCE(
    (
      SELECT pp.featured_badge
      FROM public.supplier_subscriptions ss
      JOIN public.premium_plans pp ON pp.id = ss.plan_id
      WHERE ss.supplier_id = sp.supplier_id
        AND ss.status = 'active'
      LIMIT 1
    ),
    false
  ) AS is_featured,
  COALESCE(
    (
      SELECT pp.verified_badge
      FROM public.supplier_subscriptions ss
      JOIN public.premium_plans pp ON pp.id = ss.plan_id
      WHERE ss.supplier_id = sp.supplier_id
        AND ss.status = 'active'
      LIMIT 1
    ),
    false
  ) AS is_verified
FROM public.supplier_products sp
WHERE sp.approval_status = 'approved'
  AND sp.archived_at IS NULL
  AND (
    public.my_role() = 'wholesaler'
    OR (
      SELECT wholesale_access
      FROM public.profiles
      WHERE id = auth.uid()
    ) = true
  );

GRANT SELECT ON public.supplier_products_wholesaler_read TO authenticated;

COMMENT ON VIEW public.supplier_products_wholesaler_read IS
  'Wholesaler-safe catalog — excludes supplier_id, private notes, admin/moderation/margin fields.';

DROP POLICY IF EXISTS "supplier_products: wholesaler read approved" ON public.supplier_products;
