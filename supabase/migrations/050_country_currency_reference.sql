-- =============================================================================
-- Migration 050 — Référentiel PAYS + DEVISES (fondations multi-pays)
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Poser les FONDATIONS référentielles du modèle multi-pays asymétrique :
--     - currencies      : devises autorisées (MAD, USD, AED, EUR)
--     - countries       : pays + 5 capacités INDÉPENDANTES + devise opérationnelle
--     - exchange_rates  : taux de change pivot-MAD, APPEND-ONLY (historique auditable)
--     - country_aliases : raccord NON destructif des libellés texte existants
--
--   ARCHITECTURE pays = CAPACITÉS (pas un mode unique). Chaque pays porte des
--   flags indépendants : has_office, has_warehouse, can_source, cod_enabled,
--   can_receive_export. La devise opérationnelle d'un pays = devise du pays
--   DESTINATION (USD par défaut hors MA/AE/EUR).
--
--   PRINCIPE DIRECTEUR — ADD-ONLY :
--   Cette migration n'AJOUTE que de nouvelles tables. Elle ne modifie AUCUNE
--   colonne ni contrainte existante. Aucune FK n'est posée sur les colonnes
--   texte actuelles (import_tariffs.country, origin_country, destination_country,
--   countries_served[]). Le raccord effectif se fera en ÉTAPE 2 via country_aliases.
--   → Le moteur COD-Maroc et le sourcing existant restent STRICTEMENT inchangés.
--
--   COD = MAROC UNIQUEMENT : seul 'MA' a cod_enabled = true. Aucune lecture de ce
--   flag n'est faite ici ; il deviendra le garde-fou des étapes suivantes.
--
--   Argent / taux : numeric. AUCUN float.
--
--   BACKLOG ÉTAPE 2 (audit security-reviewer — à traiter quand le référentiel
--   sera LU par le moteur argent / raccord effectif posé) :
--     - IMP-1 : garde-fou empêchant la mutation de countries.operational_currency
--               pour 'MA' (cohérence COD-Maroc / pivot MAD) + interdire le DELETE
--               d'une devise référencée par countries/exchange_rates.
--     - MIN-1 : ne pas exposer exchange_rates.created_by en lecture publique une
--               fois la colonne peuplée (exclure de la lecture anon).
--     - MIN-2 : écrire les taux via server action / Edge Function + validation zod
--               (rate_vs_mad > 0, quote_code ∈ devises actives), pas en INSERT direct.
--     - MIN-3 : normaliser country_aliases.alias (trim/lower ou collation
--               insensible à la casse) au moment du raccord, pour éviter un
--               country_code NULL silencieux.
--     - IMP-2 : CORRIGÉ ici (vue current_exchange_rates en security_invoker=true).
-- =============================================================================

-- ── 1. currencies (référentiel devises) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.currencies (
  code        text          PRIMARY KEY,                 -- ISO 4217 : 'MAD','USD','AED','EUR'
  name        text          NOT NULL,
  symbol      text          NOT NULL,
  decimals    smallint      NOT NULL DEFAULT 2 CHECK (decimals >= 0),
  active      boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.currencies IS
  'Référentiel des devises autorisées (ISO 4217). Devise opérationnelle d''un pays '
  '= devise du pays destination. Devises supportées : MAD, USD, AED, EUR.';

INSERT INTO public.currencies (code, name, symbol) VALUES
  ('MAD', 'Dirham marocain',        'د.م.'),
  ('USD', 'Dollar américain',       '$'),
  ('AED', 'Dirham des Émirats',     'د.إ'),
  ('EUR', 'Euro',                   '€')
ON CONFLICT (code) DO NOTHING;

-- ── 2. countries (référentiel pays + capacités) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.countries (
  code                  text          PRIMARY KEY,       -- ISO 3166-1 alpha-2 : 'MA','EG','AE','TR','CN','FR'...
  name_fr               text          NOT NULL,
  name_en               text          NOT NULL,
  -- 5 capacités INDÉPENDANTES — deny par défaut (false)
  has_office            boolean       NOT NULL DEFAULT false,
  has_warehouse         boolean       NOT NULL DEFAULT false,
  can_source            boolean       NOT NULL DEFAULT false,
  cod_enabled           boolean       NOT NULL DEFAULT false,   -- COD = Maroc UNIQUEMENT
  can_receive_export    boolean       NOT NULL DEFAULT false,
  operational_currency  text          NOT NULL REFERENCES public.currencies(code),
  active                boolean       NOT NULL DEFAULT true,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_countries_active        ON public.countries(active);
CREATE INDEX IF NOT EXISTS idx_countries_can_source    ON public.countries(can_source) WHERE can_source = true;
CREATE INDEX IF NOT EXISTS idx_countries_has_warehouse ON public.countries(has_warehouse) WHERE has_warehouse = true;
CREATE INDEX IF NOT EXISTS idx_countries_currency      ON public.countries(operational_currency);

COMMENT ON TABLE public.countries IS
  'Référentiel pays (ISO alpha-2). Un pays = jeu de capacités INDÉPENDANTES '
  '(office/warehouse/source/cod/export). cod_enabled=true UNIQUEMENT pour MA. '
  'operational_currency = devise du pays (utilisée comme devise opérationnelle destination).';

COMMENT ON COLUMN public.countries.cod_enabled IS
  'Cash-on-delivery activé. true UNIQUEMENT pour le Maroc (MA). Garde-fou COD-Maroc.';

-- Trigger updated_at (réutilise public.handle_updated_at() — migration 001)
DROP TRIGGER IF EXISTS trg_countries_updated_at ON public.countries;
CREATE TRIGGER trg_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed capacités (selon décisions validées) :
--   Pays "full"     (office+warehouse+source+export) : MA, EG, AE, TR, CN
--   COD             : MA uniquement
--   Export only     : FR (Europe), US (Amérique), + qq pays Afrique (source plus tard)
--   Devise op.      : MA→MAD, AE→AED, FR→EUR, tout le reste→USD
INSERT INTO public.countries
  (code, name_fr,            name_en,           has_office, has_warehouse, can_source, cod_enabled, can_receive_export, operational_currency) VALUES
  ('MA', 'Maroc',            'Morocco',          true,  true,  true,  true,  true,  'MAD'),
  ('EG', 'Égypte',           'Egypt',            true,  true,  true,  false, true,  'USD'),
  ('AE', 'Émirats arabes unis','United Arab Emirates', true, true, true, false, true, 'AED'),
  ('TR', 'Turquie',          'Turkey',           true,  true,  true,  false, true,  'USD'),
  ('CN', 'Chine',            'China',            true,  true,  true,  false, true,  'USD'),
  ('FR', 'France',           'France',           false, false, false, false, true,  'EUR'),
  ('US', 'États-Unis',       'United States',    false, false, false, false, true,  'USD'),
  ('SN', 'Sénégal',          'Senegal',          false, false, false, false, true,  'USD'),
  ('CI', 'Côte d''Ivoire',   'Ivory Coast',      false, false, false, false, true,  'USD'),
  ('ML', 'Mali',             'Mali',             false, false, false, false, true,  'USD')
ON CONFLICT (code) DO NOTHING;

-- ── 3. exchange_rates (taux pivot-MAD, APPEND-ONLY & immuable) ────────────────
-- Convention : rate_vs_mad = combien de MAD vaut 1 unité de quote_code.
--   MAD → 1. Conversion A→B = rate_vs_mad(A) / rate_vs_mad(B).
-- Append-only (discipline ledger Phase 2) : un nouveau taux = une nouvelle ligne.

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_code   text          NOT NULL REFERENCES public.currencies(code),
  rate_vs_mad  numeric(18,8) NOT NULL CHECK (rate_vs_mad > 0),  -- 1 quote_code = X MAD
  as_of        timestamptz   NOT NULL DEFAULT now(),
  source       text,                                            -- 'manual', 'api:xxx'...
  created_by   uuid          REFERENCES auth.users(id),
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_quote_asof
  ON public.exchange_rates (quote_code, as_of DESC);

COMMENT ON TABLE public.exchange_rates IS
  'Taux de change APPEND-ONLY, pivot MAD : rate_vs_mad = nb de MAD pour 1 quote_code. '
  'Historique immuable (UPDATE/DELETE/TRUNCATE bloqués). Taux courant via la vue '
  'current_exchange_rates. Conversion A→B = rate(A)/rate(B).';

-- Immuabilité (append-only) : bloquer UPDATE / DELETE / TRUNCATE
-- (même pattern que ledger_entries, migration 048).
CREATE OR REPLACE FUNCTION public.exchange_rates_block_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exchange_rates is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_exchange_rates_block_mutations ON public.exchange_rates;
CREATE TRIGGER trg_exchange_rates_block_mutations
  BEFORE UPDATE OR DELETE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.exchange_rates_block_mutations();

DROP TRIGGER IF EXISTS trg_exchange_rates_block_truncate ON public.exchange_rates;
CREATE TRIGGER trg_exchange_rates_block_truncate
  BEFORE TRUNCATE ON public.exchange_rates
  FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rates_block_mutations();

-- Seed initial : 1 taux par devise (valeurs INDICATIVES — à ajuster par l'admin).
-- N'insère que si la devise n'a aucun taux (évite les doublons en re-run).
INSERT INTO public.exchange_rates (quote_code, rate_vs_mad, source)
  SELECT v.quote_code, v.rate_vs_mad, 'seed:indicative'
  FROM (VALUES
    ('MAD', 1.00000000::numeric),
    ('USD', 10.00000000::numeric),
    ('AED', 2.72000000::numeric),
    ('EUR', 10.80000000::numeric)
  ) AS v(quote_code, rate_vs_mad)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.exchange_rates er WHERE er.quote_code = v.quote_code
  );

-- Vue : taux COURANT (dernier as_of) par devise.
-- security_invoker=true (IMP-2) : la vue hérite de la RLS de exchange_rates pour
-- l'appelant, au lieu de s'exécuter avec les droits du propriétaire (défense en
-- profondeur — si la lecture de la table est un jour restreinte, la vue suit).
CREATE OR REPLACE VIEW public.current_exchange_rates
  WITH (security_invoker = true) AS
SELECT DISTINCT ON (er.quote_code)
  er.quote_code,
  er.rate_vs_mad,
  er.as_of,
  er.source
FROM public.exchange_rates er
ORDER BY er.quote_code, er.as_of DESC;

COMMENT ON VIEW public.current_exchange_rates IS
  'Dernier taux de change connu par devise (rate_vs_mad). Lecture seule.';

GRANT SELECT ON public.current_exchange_rates TO anon, authenticated;

-- ── 4. country_aliases (raccord NON destructif des libellés existants) ────────
-- Mappe les valeurs texte ACTUELLES vers le code ISO. Permettra, en ÉTAPE 2, de
-- normaliser import_tariffs.country / origin_country / destination_country /
-- countries_served[] SANS rien casser maintenant. 'Autre' → NULL (non-pays).

CREATE TABLE IF NOT EXISTS public.country_aliases (
  alias         text  PRIMARY KEY,                              -- valeur telle qu'écrite aujourd'hui
  country_code  text  REFERENCES public.countries(code)         -- nullable : 'Autre' → NULL
);

COMMENT ON TABLE public.country_aliases IS
  'Raccord libellés texte existants → code ISO. Outil de normalisation pour l''étape 2. '
  'Ne contraint AUCUNE table existante (pas de FK posée sur l''existant à ce stade).';

INSERT INTO public.country_aliases (alias, country_code) VALUES
  ('Maroc',   'MA'),
  ('Turquie', 'TR'),
  ('Chine',   'CN'),
  ('Égypte',  'EG'),
  ('Dubai',   'AE'),   -- émirat → Émirats arabes unis
  ('Autre',   NULL)    -- catch-all non-pays
ON CONFLICT (alias) DO NOTHING;

-- =============================================================================
-- ── 5. RLS (règle d'or : deny par défaut) ────────────────────────────────────
-- Données de référence : lecture publique (anon + authenticated), écriture admin.
-- =============================================================================

ALTER TABLE public.currencies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_aliases ENABLE ROW LEVEL SECURITY;

-- ── currencies ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "currencies: public read" ON public.currencies;
CREATE POLICY "currencies: public read"
  ON public.currencies FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "currencies: admin write" ON public.currencies;
CREATE POLICY "currencies: admin write"
  ON public.currencies FOR ALL TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── countries ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "countries: public read" ON public.countries;
CREATE POLICY "countries: public read"
  ON public.countries FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "countries: admin write" ON public.countries;
CREATE POLICY "countries: admin write"
  ON public.countries FOR ALL TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── exchange_rates ───────────────────────────────────────────────────────────
-- SELECT public ; INSERT admin uniquement. PAS de policy UPDATE/DELETE :
-- l'immuabilité est garantie par les triggers ci-dessus (append-only effectif,
-- y compris contre service_role qui contourne la RLS).
DROP POLICY IF EXISTS "exchange_rates: public read" ON public.exchange_rates;
CREATE POLICY "exchange_rates: public read"
  ON public.exchange_rates FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "exchange_rates: admin insert" ON public.exchange_rates;
CREATE POLICY "exchange_rates: admin insert"
  ON public.exchange_rates FOR INSERT TO authenticated
  WITH CHECK (public.my_role() = 'admin');

-- ── country_aliases ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "country_aliases: public read" ON public.country_aliases;
CREATE POLICY "country_aliases: public read"
  ON public.country_aliases FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "country_aliases: admin write" ON public.country_aliases;
CREATE POLICY "country_aliases: admin write"
  ON public.country_aliases FOR ALL TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
