-- =============================================================================
-- Migration 086 — Affectation agents de sourcing par pays (SOUS-LOT A : fondation DB)
-- =============================================================================
-- Objectif : permettre à un admin d'affecter des agents à des pays de sourcing
-- (CN/TR/EG/AE/MA) et leur donner une vue redactée des demandes de sourcing
-- filtrées sur leurs pays — sans exposer aucune PII grossiste.
--
-- PÉRIMÈTRE :
--   1. Colonne target_country_code (ISO alpha-2) sur sourcing_requests + backfill
--   2. Capability 'manage_country_sourcing' dans staff_permissions
--   3. Table audit agent_country_audit (append-only immuable)
--   4. RPCs admin-gated : link_agent_country / unlink_agent_country
--   5. RPC redactée agent : list_agent_sourcing_requests + list_agent_country_codes
--
-- RÈGLES RESPECTÉES :
--   - 100 % additif / idempotent (IF NOT EXISTS / CREATE OR REPLACE)
--   - RLS deny par défaut sur chaque nouvelle table
--   - Écriture sensible via RPC SECURITY DEFINER uniquement (jamais depuis le client)
--   - service_role jamais exposé au client
--   - target_budget_mad (argent) NON TOUCHÉ
--   - La RLS de base de sourcing_requests NON TOUCHÉE (l'agent passe par RPC redactée)
-- =============================================================================


-- =============================================================================
-- 1. COLONNE NORMALISÉE target_country_code sur sourcing_requests
-- =============================================================================

-- La table countries existe (mig 050) et contient CN/TR/EG/AE/MA → FK safe.
-- NULLABLE car les demandes existantes peuvent ne pas avoir de pays, et les
-- nouvelles demandes peuvent être "tous pays" avant affectation admin.
ALTER TABLE public.sourcing_requests
  ADD COLUMN IF NOT EXISTS target_country_code text
    REFERENCES public.countries(code) ON DELETE SET NULL;

COMMENT ON COLUMN public.sourcing_requests.target_country_code IS
  'Code pays ISO alpha-2 normalisé (mig 086). Déduit de target_country (texte libre) '
  'via backfill. NULLABLE : demandes sans pays ou "Autre" restent NULL. '
  'Ne jamais modifier depuis le client (server action uniquement).';

-- Index pour filtrage agent : « mes demandes par pays »
CREATE INDEX IF NOT EXISTS idx_sourcing_requests_country
  ON public.sourcing_requests (target_country_code)
  WHERE target_country_code IS NOT NULL;

-- ── Backfill depuis target_country (texte libre FR) ───────────────────────────
-- Utilise les mêmes mappings que country_aliases (mig 050). Conditionnel sur
-- target_country_code IS NULL pour idempotence (ne ré-écrase pas si déjà rempli).
-- Pays non reconnus (Inde, Autre, NULL, texte libre inconnu) → restent NULL.
UPDATE public.sourcing_requests
SET target_country_code = CASE
  WHEN lower(trim(target_country)) IN ('chine', 'china', 'cn')               THEN 'CN'
  WHEN lower(trim(target_country)) IN ('turquie', 'turkey', 'tr')            THEN 'TR'
  WHEN lower(trim(target_country)) IN ('égypte', 'egypte', 'egypt', 'eg')   THEN 'EG'
  WHEN lower(trim(target_country)) IN ('dubai', 'dubaï', 'émirats', 'emirates', 'ae') THEN 'AE'
  WHEN lower(trim(target_country)) IN ('maroc', 'morocco', 'ma')             THEN 'MA'
  ELSE NULL
END
WHERE target_country_code IS NULL
  AND target_country IS NOT NULL;


-- =============================================================================
-- 2. CAPABILITY 'manage_country_sourcing' dans staff_permissions
-- =============================================================================

-- ── 2a. Étendre le CHECK constraint pour autoriser la nouvelle capacité ────────
-- Pattern : DROP + ADD CONSTRAINT (ALTER TABLE ADD COLUMN IF NOT EXISTS interdit
-- de modifier une contrainte CHECK existante nommée sans la supprimer d'abord).
ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_capability_known;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_capability_known CHECK (
    capability IN ('validate_categories', 'manage_country_sourcing')
  );

-- ── 2b. Étendre l'allowlist en dur dans grant_staff_permission ────────────────
-- CREATE OR REPLACE complet — TOUT le corps est identique à mig 083 sauf la ligne
-- IF p_capability NOT IN (...) qui ajoute 'manage_country_sourcing'.
CREATE OR REPLACE FUNCTION public.grant_staff_permission(
  p_user_id    uuid,
  p_capability text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  -- Capacité connue uniquement (défense en plus du CHECK table).
  IF p_capability NOT IN ('validate_categories', 'manage_country_sourcing') THEN
    RAISE EXCEPTION 'Capacité inconnue : %', p_capability;
  END IF;
  -- La cible doit exister.
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Idempotent : déjà accordée → aucune écriture ni audit.
  INSERT INTO public.staff_permissions (user_id, capability, granted_by)
  VALUES (p_user_id, p_capability, v_actor)
  ON CONFLICT (user_id, capability) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.staff_permission_audit (action, user_id, capability, changed_by)
    VALUES ('grant', p_user_id, p_capability, v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.grant_staff_permission(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_staff_permission(uuid, text) TO authenticated;


-- =============================================================================
-- 3. AUDIT D'AFFECTATION PAYS — agent_country_audit (append-only immuable)
-- =============================================================================
-- Modèle : staff_permission_audit (mig 083). Trace chaque link/unlink d'un agent
-- à un pays de sourcing. Immuable : UPDATE/DELETE rejetés par trigger (même pattern
-- que trg_staff_permission_audit_immutable).

CREATE TABLE IF NOT EXISTS public.agent_country_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  country_code text       NOT NULL,
  action      text        NOT NULL CHECK (action IN ('link', 'unlink')),
  changed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_country_audit_agent
  ON public.agent_country_audit (agent_id, changed_at DESC);

ALTER TABLE public.agent_country_audit ENABLE ROW LEVEL SECURITY;

-- Admin read-only. Aucune policy d'écriture → INSERT via RPC definer only.
DROP POLICY IF EXISTS "agent_country_audit_admin_read" ON public.agent_country_audit;
CREATE POLICY "agent_country_audit_admin_read"
  ON public.agent_country_audit
  FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- Immuabilité : UPDATE/DELETE rejetés pour TOUS (y compris definer/service_role).
CREATE OR REPLACE FUNCTION public.agent_country_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent_country_audit est append-only (ni UPDATE ni DELETE)';
END $$;

DROP TRIGGER IF EXISTS trg_agent_country_audit_immutable ON public.agent_country_audit;
CREATE TRIGGER trg_agent_country_audit_immutable
  BEFORE UPDATE OR DELETE ON public.agent_country_audit
  FOR EACH ROW EXECUTE FUNCTION public.agent_country_audit_immutable();

COMMENT ON TABLE public.agent_country_audit IS
  'Audit IMMUABLE des affectations/désaffectations d''un agent à un pays de sourcing '
  '(link/unlink). Append-only : UPDATE/DELETE bloqués par trigger. Lecture admin seule. '
  'Écrit uniquement via link_agent_country / unlink_agent_country (RPC definer).';


-- =============================================================================
-- 4. RPCs ADMIN-GATED D'AFFECTATION (modèle grant/revoke_staff_permission)
-- =============================================================================

-- Pays de sourcing autorisés (allowlist en dur, défense en profondeur).
-- La FK countries(code) garantit l'existence ; la liste ici garantit que seuls les
-- pays de sourcing actifs sont affectables (pas ex. FR ou US qui n'ont pas can_source).
-- ÉTENDRE ICI si un nouveau pays de sourcing est activé.

-- ── 4a. link_agent_country ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_agent_country(
  p_agent_id   uuid,
  p_country_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  -- Gate admin
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  -- Pays autorisé (allowlist sourcing — doit aussi exister dans countries via FK agent_countries)
  IF p_country_code NOT IN ('CN', 'TR', 'EG', 'AE', 'MA') THEN
    RAISE EXCEPTION 'Pays de sourcing inconnu ou non autorisé : %', p_country_code;
  END IF;

  -- La cible doit être un agent
  SELECT role INTO v_role FROM public.profiles WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent introuvable';
  END IF;
  IF v_role <> 'agent' THEN
    RAISE EXCEPTION 'Le profil % n''est pas un agent (rôle actuel : %)', p_agent_id, v_role;
  END IF;

  -- Idempotent : déjà lié → aucune écriture ni audit
  INSERT INTO public.agent_countries (agent_id, country_code)
  VALUES (p_agent_id, p_country_code)
  ON CONFLICT (agent_id, country_code) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.agent_country_audit (agent_id, country_code, action, changed_by)
    VALUES (p_agent_id, p_country_code, 'link', v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.link_agent_country(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.link_agent_country(uuid, text) TO authenticated;

-- ── 4b. unlink_agent_country ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unlink_agent_country(
  p_agent_id   uuid,
  p_country_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_deleted integer;
BEGIN
  -- Gate admin
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  DELETE FROM public.agent_countries
   WHERE agent_id = p_agent_id AND country_code = p_country_code;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Idempotent : rien à retirer → pas d'audit
  IF v_deleted > 0 THEN
    INSERT INTO public.agent_country_audit (agent_id, country_code, action, changed_by)
    VALUES (p_agent_id, p_country_code, 'unlink', v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.unlink_agent_country(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unlink_agent_country(uuid, text) TO authenticated;


-- =============================================================================
-- 5. RPCs REDACTÉES POUR L'AGENT (modèle mig 085 list_pending_category_suggestions)
-- =============================================================================

-- ── 5a. list_agent_sourcing_requests() — vue filtrée pays, sans PII grossiste ─
-- Gate : has_capability('manage_country_sourcing').
-- Filtre : uniquement les demandes dont target_country_code IN (pays de l'agent).
-- Colonnes renvoyées : AUCUNE PII client (pas de wholesaler_id, pas de nom, téléphone,
-- adresse). Uniquement les champs produit/logistique utiles au sourcing.
CREATE OR REPLACE FUNCTION public.list_agent_sourcing_requests()
RETURNS TABLE (
  id                  uuid,
  product_name        text,
  category            text,
  quantity            integer,
  target_country_code text,
  delivery_deadline   date,
  notes               text,
  status              text,
  created_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_capability('manage_country_sourcing') THEN
    RAISE EXCEPTION 'Permission requise : manage_country_sourcing';
  END IF;

  RETURN QUERY
    SELECT
      sr.id,
      sr.product_name,
      sr.category,
      sr.quantity,
      sr.target_country_code,
      sr.delivery_deadline,
      sr.notes,
      sr.status,
      sr.created_at
    FROM public.sourcing_requests sr
    WHERE sr.target_country_code IN (
      SELECT ac.country_code
      FROM public.agent_countries ac
      WHERE ac.agent_id = auth.uid()
    )
    ORDER BY sr.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_agent_sourcing_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_agent_sourcing_requests() TO authenticated;

COMMENT ON FUNCTION public.list_agent_sourcing_requests() IS
  'Lecture redactée des demandes de sourcing pour les agents porteurs de '
  'manage_country_sourcing (mig 086). Filtre sur les pays affectés à auth.uid() '
  'dans agent_countries. N''expose AUCUNE PII grossiste (pas d''id grossiste, '
  'nom, téléphone, adresse). Gate : has_capability. Modèle mig 085.';

-- ── 5b. list_agent_country_codes() — pays affectés à l'agent connecté ─────────
-- Permet à l'UI agent d'afficher "vos pays de sourcing". Pas de gate capability
-- car c'est de l'awareness pure sur les propres données de l'agent (équivalent
-- d'une lecture de ses propres lignes agent_countries, mais sans accès RLS direct).
CREATE OR REPLACE FUNCTION public.list_agent_country_codes()
RETURNS TABLE (country_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ac.country_code
  FROM public.agent_countries ac
  WHERE ac.agent_id = auth.uid()
  ORDER BY ac.country_code;
$$;

REVOKE ALL ON FUNCTION public.list_agent_country_codes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_agent_country_codes() TO authenticated;

COMMENT ON FUNCTION public.list_agent_country_codes() IS
  'Renvoie les codes pays ISO alpha-2 affectés à l''agent connecté (auth.uid()). '
  'Awareness UI : "vos pays de sourcing". SECURITY DEFINER pour franchir la RLS '
  'admin-only de agent_countries sans l''ouvrir en lecture agent.';
