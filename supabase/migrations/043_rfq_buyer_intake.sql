-- Migration 043: RFQ buyer intake (purchase profile + volume tier) on marketplace quote requests
-- Stored on supplier_quote_requests; exposed in admin UI only (not supplier queries).

ALTER TABLE public.supplier_quote_requests
  ADD COLUMN IF NOT EXISTS buyer_purchase_profile text,
  ADD COLUMN IF NOT EXISTS buyer_volume_tier text;

ALTER TABLE public.supplier_quote_requests
  DROP CONSTRAINT IF EXISTS supplier_quote_requests_buyer_purchase_profile_check;

ALTER TABLE public.supplier_quote_requests
  ADD CONSTRAINT supplier_quote_requests_buyer_purchase_profile_check
  CHECK (
    buyer_purchase_profile IS NULL
    OR buyer_purchase_profile IN (
      'physical_store',
      'social_reseller',
      'wholesaler',
      'importer'
    )
  );

ALTER TABLE public.supplier_quote_requests
  DROP CONSTRAINT IF EXISTS supplier_quote_requests_buyer_volume_tier_check;

ALTER TABLE public.supplier_quote_requests
  ADD CONSTRAINT supplier_quote_requests_buyer_volume_tier_check
  CHECK (
    buyer_volume_tier IS NULL
    OR buyer_volume_tier IN (
      'test_20_50',
      'small_100_300',
      'active_500_1000',
      'importer_1000_plus'
    )
  );

COMMENT ON COLUMN public.supplier_quote_requests.buyer_purchase_profile IS
  'Buyer self-reported profile (admin-only at query layer).';

COMMENT ON COLUMN public.supplier_quote_requests.buyer_volume_tier IS
  'Buyer self-reported volume band (admin-only at query layer).';
