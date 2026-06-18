-- =============================================================================
-- Migration 078 — agent_countries : superviseurs pays (notif awareness)  (LOT 7)
-- =============================================================================
-- Lie des agents (role='agent') à des pays (countries.code, ISO alpha-2). Sert
-- UNIQUEMENT à élargir les destinataires in-app de notifyOrderAssigned : quand une
-- commande B2B est assignée à un fournisseur, les agents liés au pays du
-- fournisseur reçoivent la même notif PII-safe (awareness).
--
-- PORTÉE : awareness seule. Cette table NE donne AUCUN accès à la fiche commande.
-- La RLS de wholesale_orders n'est PAS touchée. Le payload notif reste inchangé
-- (zéro PII : ref, items[label,qty], city, dueAt).
--
-- RLS : admin ONLY (lecture ET écriture). Aucun autre rôle n'accède à cette table
-- (deny par défaut). country_code est FIGÉ côté profiles (trigger admin-only) ;
-- ici on ne touche pas profiles, on ne fait que référencer countries.code.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.agent_countries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  country_code text        NOT NULL REFERENCES public.countries(code)  ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_countries_agent_country_unique UNIQUE (agent_id, country_code)
);

-- Lookup principal de la notif : « tous les agents liés à CE pays ».
-- (agent_id est couvert en tête de l'index UNIQUE → pas d'index dédié nécessaire.)
CREATE INDEX IF NOT EXISTS idx_agent_countries_country
  ON public.agent_countries (country_code);

ALTER TABLE public.agent_countries ENABLE ROW LEVEL SECURITY;

-- Admin ONLY — lecture ET écriture (FOR ALL). Deny par défaut pour tout le reste.
DROP POLICY IF EXISTS "agent_countries_admin_all" ON public.agent_countries;
CREATE POLICY "agent_countries_admin_all"
  ON public.agent_countries
  FOR ALL
  TO authenticated
  USING      (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

COMMENT ON TABLE public.agent_countries IS
  'Lie des agents (role=agent) à des pays (countries.code) pour élargir les '
  'destinataires in-app de notifyOrderAssigned (awareness pays). N agents/pays '
  'ET N pays/agent (UNIQUE agent_id,country_code). RLS admin-only (FOR ALL). '
  'Awareness SEULE : ne donne aucun accès à wholesale_orders.';
