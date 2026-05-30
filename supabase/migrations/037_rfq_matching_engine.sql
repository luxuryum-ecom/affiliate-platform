-- =============================================================================
-- Migration: 037_rfq_matching_engine (idempotent — safe to re-run)
-- Supplier matching profiles, RFQ match records, supplier offers / responses.
-- =============================================================================

-- ── 1. supplier_matching_profiles ─────────────────────────────────────────────
-- One row per supplier. Defines capabilities used by the scoring engine.
-- Admin-visible only (supplier edits own row; wholesalers never see it).

CREATE TABLE IF NOT EXISTS public.supplier_matching_profiles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Capability fields
  categories          text[]      NOT NULL DEFAULT '{}',
  countries_served    text[]      NOT NULL DEFAULT '{}',
  moq_min             integer     CHECK (moq_min >= 0),
  moq_max             integer     CHECK (moq_max >= 0),
  production_capacity integer,    -- units per month
  lead_time_days_min  integer     CHECK (lead_time_days_min >= 0),
  lead_time_days_max  integer     CHECK (lead_time_days_max >= 0),
  export_capable      boolean     NOT NULL DEFAULT false,
  supplier_type       text        NOT NULL DEFAULT 'international'
                      CHECK (supplier_type IN ('morocco', 'international')),
  -- Computed stats (updated by trigger or server action)
  response_rate       numeric(5,2) NOT NULL DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  reliability_score   numeric(5,2) NOT NULL DEFAULT 100 CHECK (reliability_score >= 0 AND reliability_score <= 100),
  total_offers_sent   integer     NOT NULL DEFAULT 0,
  total_offers_accepted integer   NOT NULL DEFAULT 0,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smp_supplier_id ON public.supplier_matching_profiles(supplier_id);
CREATE INDEX IF NOT EXISTS idx_smp_categories  ON public.supplier_matching_profiles USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_smp_countries   ON public.supplier_matching_profiles USING GIN(countries_served);
CREATE INDEX IF NOT EXISTS idx_smp_active      ON public.supplier_matching_profiles(active);

DROP TRIGGER IF EXISTS trg_smp_updated_at ON public.supplier_matching_profiles;
CREATE TRIGGER trg_smp_updated_at
  BEFORE UPDATE ON public.supplier_matching_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.supplier_matching_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "smp: supplier own" ON public.supplier_matching_profiles;
CREATE POLICY "smp: supplier own"
  ON public.supplier_matching_profiles FOR ALL TO authenticated
  USING  (supplier_id = auth.uid() AND public.my_role() = 'supplier')
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

DROP POLICY IF EXISTS "smp: admin all" ON public.supplier_matching_profiles;
CREATE POLICY "smp: admin all"
  ON public.supplier_matching_profiles FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 2. rfq_matches ────────────────────────────────────────────────────────────
-- One row per (sourcing_request OR quote_request) × supplier match.
-- Records the score breakdown for auditing and analytics.

CREATE TABLE IF NOT EXISTS public.rfq_matches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source: exactly one of sourcing_request_id or quote_request_id
  sourcing_request_id   uuid        REFERENCES public.sourcing_requests(id) ON DELETE CASCADE,
  quote_request_id      uuid        REFERENCES public.quote_requests(id)    ON DELETE CASCADE,
  supplier_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Score breakdown (0–100 total)
  total_score           numeric(5,2) NOT NULL DEFAULT 0,
  score_category        numeric(5,2) NOT NULL DEFAULT 0,
  score_country         numeric(5,2) NOT NULL DEFAULT 0,
  score_moq             numeric(5,2) NOT NULL DEFAULT 0,
  score_lead_time       numeric(5,2) NOT NULL DEFAULT 0,
  score_reliability     numeric(5,2) NOT NULL DEFAULT 0,
  score_response_rate   numeric(5,2) NOT NULL DEFAULT 0,
  -- Status
  status                text        NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'notified', 'offer_received', 'declined', 'clarification', 'selected', 'expired')),
  notified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfq_matches_one_source CHECK (
    (sourcing_request_id IS NOT NULL)::int + (quote_request_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_rfqm_sourcing    ON public.rfq_matches(sourcing_request_id);
CREATE INDEX IF NOT EXISTS idx_rfqm_quote       ON public.rfq_matches(quote_request_id);
CREATE INDEX IF NOT EXISTS idx_rfqm_supplier    ON public.rfq_matches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfqm_score       ON public.rfq_matches(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_rfqm_status      ON public.rfq_matches(status);
CREATE INDEX IF NOT EXISTS idx_rfqm_created_at  ON public.rfq_matches(created_at DESC);

DROP TRIGGER IF EXISTS trg_rfqm_updated_at ON public.rfq_matches;
CREATE TRIGGER trg_rfqm_updated_at
  BEFORE UPDATE ON public.rfq_matches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.rfq_matches ENABLE ROW LEVEL SECURITY;

-- Supplier: see own matches (not other suppliers')
DROP POLICY IF EXISTS "rfqm: supplier own" ON public.rfq_matches;
CREATE POLICY "rfqm: supplier own"
  ON public.rfq_matches FOR SELECT TO authenticated
  USING (supplier_id = auth.uid() AND public.my_role() = 'supplier');

-- Admin: full access
DROP POLICY IF EXISTS "rfqm: admin all" ON public.rfq_matches;
CREATE POLICY "rfqm: admin all"
  ON public.rfq_matches FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 3. rfq_offers ─────────────────────────────────────────────────────────────
-- Supplier response to an RFQ match: offer, decline, or clarification.
-- Wholesaler identity never exposed to supplier.

CREATE TABLE IF NOT EXISTS public.rfq_offers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_match_id    uuid        NOT NULL REFERENCES public.rfq_matches(id) ON DELETE CASCADE,
  supplier_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_type   text        NOT NULL
                  CHECK (response_type IN ('offer', 'decline', 'clarification')),
  -- Offer fields (only for response_type='offer')
  unit_price_usd  numeric(10,4),
  moq_offered     integer,
  lead_time_days  integer,
  notes           text,
  message         text,
  -- Admin review
  admin_notes     text,
  admin_reviewed  boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfqo_match_id   ON public.rfq_offers(rfq_match_id);
CREATE INDEX IF NOT EXISTS idx_rfqo_supplier_id ON public.rfq_offers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_rfqo_type        ON public.rfq_offers(response_type);
CREATE INDEX IF NOT EXISTS idx_rfqo_created_at  ON public.rfq_offers(created_at DESC);

ALTER TABLE public.rfq_offers ENABLE ROW LEVEL SECURITY;

-- Supplier: insert + read own
DROP POLICY IF EXISTS "rfqo: supplier own" ON public.rfq_offers;
CREATE POLICY "rfqo: supplier own"
  ON public.rfq_offers FOR ALL TO authenticated
  USING  (supplier_id = auth.uid() AND public.my_role() = 'supplier')
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

-- Admin: full access
DROP POLICY IF EXISTS "rfqo: admin all" ON public.rfq_offers;
CREATE POLICY "rfqo: admin all"
  ON public.rfq_offers FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
