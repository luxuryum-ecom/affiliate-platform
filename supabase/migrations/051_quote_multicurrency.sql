-- =============================================================================
-- Migration 051 — Multi-devise sur le circuit devis (quote_requests)
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Brancher le référentiel devises/taux (migration 050) sur le circuit devis :
--     - Helpers de lecture du taux central + résolution pays→devise client
--     - Colonnes SNAPSHOT figées sur quote_requests (source→MAD et MAD→devise client)
--     - Colonnes SNAPSHOT propagées sur wholesale_orders à la conversion du devis
--     - Garde-fous référentiel (backlog audit Étape 1 : IMP-1, MIN-1, MIN-3)
--
--   PIVOT INTERNE = MAD (inchangé). Le multi-devise est une couche de BORD :
--   conversion à l'entrée (prix source → MAD) et à la sortie (MAD → devise client),
--   les DEUX taux figés sur le devis pour reproductibilité (règle d'or argent).
--
--   ADD-ONLY : colonnes additives nullables, fonctions/ triggers nouveaux.
--   Aucune colonne/contrainte existante modifiée. COD-Maroc et ledger non touchés.
--   Argent / taux : numeric. AUCUN float.
-- =============================================================================

-- ── 1. Helpers : taux central + résolution pays → devise client ──────────────

-- Taux courant d'une devise vers MAD (nb de MAD pour 1 unité). NULL si inconnue.
CREATE OR REPLACE FUNCTION public.fx_rate_to_mad(p_code text)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT rate_vs_mad FROM public.current_exchange_rates WHERE quote_code = p_code
$$;

COMMENT ON FUNCTION public.fx_rate_to_mad(text) IS
  'Taux courant devise→MAD (current_exchange_rates). NULL si devise inconnue.';

-- Résout un libellé pays texte libre vers un code ISO (insensible casse/espaces).
-- Couvre MIN-3 : tente alias, puis code, puis nom FR/EN. NULL si non résolu.
CREATE OR REPLACE FUNCTION public.resolve_country_code(p_label text)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT code FROM (
    SELECT ca.country_code AS code, 1 AS prio
      FROM public.country_aliases ca
     WHERE lower(btrim(ca.alias)) = lower(btrim(p_label)) AND ca.country_code IS NOT NULL
    UNION ALL
    SELECT c.code, 2
      FROM public.countries c
     WHERE lower(btrim(c.code)) = lower(btrim(p_label))
        OR lower(btrim(c.name_fr)) = lower(btrim(p_label))
        OR lower(btrim(c.name_en)) = lower(btrim(p_label))
  ) m
  ORDER BY prio
  LIMIT 1
$$;

COMMENT ON FUNCTION public.resolve_country_code(text) IS
  'Libellé pays texte libre → code ISO (alias/code/nom, insensible casse/espaces). NULL si non résolu.';

-- Devise opérationnelle du pays client. Fallback 'MAD' si pays non résolu.
CREATE OR REPLACE FUNCTION public.client_currency_for(p_label text)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT c.operational_currency
       FROM public.countries c
      WHERE c.code = public.resolve_country_code(p_label)),
    'MAD'
  )
$$;

COMMENT ON FUNCTION public.client_currency_for(text) IS
  'Devise opérationnelle du pays client (countries.operational_currency). Fallback MAD.';

-- ── 2. quote_requests — colonnes snapshot (nullable, additives) ──────────────

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS source_currency          text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS quoted_unit_price_source numeric(12,4),
  ADD COLUMN IF NOT EXISTS fx_rate_source_to_mad    numeric(18,8) CHECK (fx_rate_source_to_mad IS NULL OR fx_rate_source_to_mad > 0),
  ADD COLUMN IF NOT EXISTS display_currency         text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS fx_rate_display_vs_mad   numeric(18,8) CHECK (fx_rate_display_vs_mad IS NULL OR fx_rate_display_vs_mad > 0);

COMMENT ON COLUMN public.quote_requests.source_currency IS
  'Devise source figée du prix marchandise saisi par l''admin (FK currencies).';
COMMENT ON COLUMN public.quote_requests.quoted_unit_price_source IS
  'Prix unitaire marchandise en devise source (avant conversion MAD).';
COMMENT ON COLUMN public.quote_requests.fx_rate_source_to_mad IS
  'Taux figé source→MAD utilisé pour dériver quoted_unit_price_mad (pivot).';
COMMENT ON COLUMN public.quote_requests.display_currency IS
  'Devise d''affichage client figée (= devise du pays destination).';
COMMENT ON COLUMN public.quote_requests.fx_rate_display_vs_mad IS
  'Taux figé display↔MAD (nb MAD pour 1 unité display). Montant affiché = mad / ce taux.';

-- ── 3. wholesale_orders — colonnes snapshot propagées (nullable, additives) ──

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS source_currency          text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS fx_rate_source_to_mad    numeric(18,8) CHECK (fx_rate_source_to_mad IS NULL OR fx_rate_source_to_mad > 0),
  ADD COLUMN IF NOT EXISTS merchandise_source_amount numeric(14,4);

COMMENT ON COLUMN public.wholesale_orders.source_currency IS
  'Devise source figée recopiée du devis d''origine (traçabilité argent).';
COMMENT ON COLUMN public.wholesale_orders.fx_rate_source_to_mad IS
  'Taux figé source→MAD recopié du devis d''origine.';
COMMENT ON COLUMN public.wholesale_orders.merchandise_source_amount IS
  'Montant marchandise en devise source (= prix unit. source × quantité) au moment du devis.';

-- =============================================================================
-- ── 4. Backlog audit Étape 1 — garde-fous (référentiel devient LU) ───────────
-- =============================================================================

-- IMP-1a : interdire le changement de countries.operational_currency pour 'MA'
-- (garantit MAD/COD-Maroc). Le DELETE d'une devise référencée est DÉJÀ bloqué par
-- les FK (NO ACTION) sur countries/exchange_rates/quote_requests/wholesale_orders.
CREATE OR REPLACE FUNCTION public.guard_morocco_currency()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.code = 'MA' AND NEW.operational_currency <> 'MAD' THEN
    RAISE EXCEPTION 'operational_currency for MA is locked to MAD (COD-Maroc / pivot)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_morocco_currency ON public.countries;
CREATE TRIGGER trg_guard_morocco_currency
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.guard_morocco_currency();

-- MIN-1 : restreindre la lecture de exchange_rates à 'authenticated' (retirer anon).
-- La conversion n'est utilisée que côté admin/serveur ; évite d'exposer created_by.
-- currencies / countries restent en lecture publique (référentiel non sensible).
DROP POLICY IF EXISTS "exchange_rates: public read" ON public.exchange_rates;
DROP POLICY IF EXISTS "exchange_rates: authenticated read" ON public.exchange_rates;
CREATE POLICY "exchange_rates: authenticated read"
  ON public.exchange_rates FOR SELECT TO authenticated
  USING (true);
