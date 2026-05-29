-- =============================================================================
-- Migration 015 — City management with per-city delivery fees
-- (idempotent — safe to re-run)
-- =============================================================================
-- Changes:
--   1. cities — admin-managed city list with per-city delivery fees
--   2. Unique functional index on lower(trim(name)) — no duplicates
--   3. RLS — admin full access, anon/authenticated can read active cities
--   4. Seed — Casablanca 25 MAD, with courier API fields ready for sync
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cities (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  delivery_fee_mad        numeric(10,2) NOT NULL DEFAULT 40,
  is_active               boolean     NOT NULL DEFAULT true,

  -- ── Future courier API integration ──────────────────────────────────────────
  -- These fields are populated by the courier sync job when api_enabled is true.
  -- The application uses delivery_fee_mad; courier_fee_mad is the carrier-reported value.
  courier_code            text,             -- Carrier city code (e.g. "CMN")
  courier_zone            text,             -- Carrier zone (e.g. "ZONE_A")
  courier_fee_mad         numeric(10,2),    -- Fee last reported by courier API
  courier_sync_enabled    boolean     NOT NULL DEFAULT false,
  courier_last_synced_at  timestamptz,
  courier_metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cities IS
  'Admin-managed list of Moroccan cities with per-city COD delivery fees. '
  'courier_* fields are reserved for future courier API sync. '
  'delivery_fee_mad is always the operative fee; courier_fee_mad is advisory only.';

COMMENT ON COLUMN public.cities.courier_code IS
  'Carrier-specific city code for future API integration (e.g. "CMN" for Casablanca).';

COMMENT ON COLUMN public.cities.courier_fee_mad IS
  'Fee last reported by the courier API. Admin may override via delivery_fee_mad.';

COMMENT ON COLUMN public.cities.courier_metadata IS
  'Arbitrary carrier data for future use. Shape defined per carrier integration.';

-- ── Unique index: prevent duplicate city names (case-insensitive) ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS cities_name_lower_uniq
  ON public.cities (lower(trim(name)));

-- ── updated_at trigger ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cities_updated_at ON public.cities;
CREATE TRIGGER trg_cities_updated_at
  BEFORE UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cities_admin_all ON public.cities;
CREATE POLICY cities_admin_all ON public.cities
  FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- Public read for active cities — used by placeOrder (runs without auth session).
-- The service-role key bypasses RLS; anon callers can read active city fees for
-- delivery cost display on the public order form.
DROP POLICY IF EXISTS cities_public_read ON public.cities;
CREATE POLICY cities_public_read ON public.cities
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ── Seed default cities ───────────────────────────────────────────────────────
-- Casablanca gets the preferential city fee (25 MAD).
-- Other major cities seeded with the standard fee (40 MAD).
-- ON CONFLICT keeps existing admin-configured fees intact on re-run.

INSERT INTO public.cities (name, delivery_fee_mad, courier_code)
  VALUES
    ('Casablanca',  25, 'CMN'),
    ('Rabat',       40, 'RBA'),
    ('Marrakech',   40, 'RAK'),
    ('Fès',         40, 'FEZ'),
    ('Tanger',      40, 'TNG'),
    ('Agadir',      40, 'AGA'),
    ('Meknès',      40, 'MEK'),
    ('Oujda',       40, 'OUD'),
    ('Kenitra',     40, 'KEN'),
    ('Tétouan',     40, 'TET')
  ON CONFLICT (lower(trim(name))) DO NOTHING;
