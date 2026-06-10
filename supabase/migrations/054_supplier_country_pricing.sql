-- =============================================================================
-- Migration: 054_supplier_country_pricing (idempotent, ADD-ONLY, non destructif)
-- Chaîne PAYS FOURNISSEUR → DEVISE → conversion MAD sur l'ingestion produit.
--
-- Décisions Abdou :
--  • Le pays du fournisseur est choisi à l'inscription (obligatoire role=supplier),
--    puis FIGÉ : le fournisseur ne peut jamais le changer, seul l'admin corrige.
--  • Fournisseurs déjà inscrits : country_code laissé NULL (PAS de backfill).
--    Tant que NULL → soumission produit bloquée côté applicatif (jamais de MAD supposé).
--  • La devise dérive de countries.operational_currency (source unique, déjà gardée).
--  • Taux figé (snapshot) à l'ingestion ; jamais de MAD fabriqué (cf. règles app).
--
-- Réutilise l'infra FX des migrations 050/051 (currencies, countries, exchange_rates).
-- =============================================================================

-- ── 1. profiles.country_code (FK countries, nullable, SANS backfill) ─────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text REFERENCES public.countries(code);

CREATE INDEX IF NOT EXISTS idx_profiles_country_code ON public.profiles(country_code);

COMMENT ON COLUMN public.profiles.country_code IS
  'Pays du compte (FK countries). Pour role=supplier : détermine la devise de '
  'saisie des prix via countries.operational_currency. Choisi à l''inscription, '
  'figé ensuite (trigger guard_profile_country_immutable) ; seul un admin corrige.';

-- Pays FIGÉ : tout changement de country_code par un non-admin est refusé.
-- (L''INSERT initial — création du profil au signup — n''est PAS concerné.)
CREATE OR REPLACE FUNCTION public.guard_profile_country_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.country_code IS DISTINCT FROM OLD.country_code
     AND COALESCE(public.my_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'country_code est figé : seul un administrateur peut le modifier'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_country ON public.profiles;
CREATE TRIGGER trg_guard_profile_country
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_country_immutable();

-- ── 2. supplier_products : prix source + devise + taux figé ──────────────────
-- suggested_wholesale_price_mad (numeric(10,2)) existe déjà = valeur pivot MAD.

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS source_currency       text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS price_source          numeric(12,4),
  ADD COLUMN IF NOT EXISTS fx_rate_source_to_mad numeric(18,8);

-- Taux strictement positif (ou NULL si non résolu — jamais 1 par défaut).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sp_fx_rate_positive'
  ) THEN
    ALTER TABLE public.supplier_products
      ADD CONSTRAINT sp_fx_rate_positive
      CHECK (fx_rate_source_to_mad IS NULL OR fx_rate_source_to_mad > 0);
  END IF;
END $$;

-- Invariant MAD : si la devise source est MAD, le taux vaut 1 et le pivot = source.
-- (Tolérant aux NULL : un produit MAD sans prix reste valide.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sp_mad_identity'
  ) THEN
    ALTER TABLE public.supplier_products
      ADD CONSTRAINT sp_mad_identity
      CHECK (
        source_currency IS NULL
        OR source_currency <> 'MAD'
        OR (
          -- MAD ⇒ taux 1 STRICT (jamais NULL : un CHECK NULL « passe » sous
          -- Postgres, d'où le IS NOT NULL explicite) ET pivot = source.
          fx_rate_source_to_mad IS NOT NULL
          AND fx_rate_source_to_mad = 1
          AND suggested_wholesale_price_mad IS NOT DISTINCT FROM price_source
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sp_source_currency ON public.supplier_products(source_currency);

-- ── 3. Backfill ADD-ONLY — identité MAD sur l'existant (tout était en MAD) ───
-- price_source := valeur MAD actuelle, devise MAD, taux 1. Aucun produit faussé :
-- suggested_wholesale_price_mad N'EST PAS modifié (identité stricte).
-- NB : un produit existant SANS prix (suggested_wholesale_price_mad = NULL) devient
-- source_currency='MAD', price_source=NULL, fx_rate=1 — état « MAD non tarifé »
-- assumé. Le code amont doit traiter price_source NULL comme « non soumissible ».
UPDATE public.supplier_products
SET source_currency = 'MAD',
    price_source = suggested_wholesale_price_mad,
    fx_rate_source_to_mad = 1
WHERE source_currency IS NULL;

COMMENT ON COLUMN public.supplier_products.price_source IS
  'Prix tel que saisi par le fournisseur, dans sa devise (source_currency). '
  'Converti en suggested_wholesale_price_mad via fx_rate_source_to_mad (taux figé).';
COMMENT ON COLUMN public.supplier_products.fx_rate_source_to_mad IS
  'Taux devise source → MAD figé à l''ingestion (snapshot, comme quote_requests). '
  'NULL si non résolu (devise/pays inconnu) → suggested_wholesale_price_mad reste NULL.';
