-- =============================================================================
-- Migration 083 — staff_permissions : permissions MODULABLES attribuables  (L1)
-- =============================================================================
-- Fondation d'un système de PERMISSIONS granulaires attribuables/retirables par
-- l'admin à n'importe quel salarié, en un clic, réversible à tout moment.
-- Remplace l'usage du rôle binaire (`my_role()='admin'`) pour les capacités
-- déléguables, SANS toucher au rôle ni aux verrous existants.
--
-- Capacité initiale : `validate_categories` (valider la file de suggestions de
-- catégories — cf. L2/L4). Conçu pour héberger d'autres capacités plus tard
-- (ex. `assign_sourcing_country`) → AJOUTER alors la valeur au CHECK + au code.
--
-- 🛑 POINT SENSIBLE (argent/canal) — NON TOUCHÉ ICI : le toggle
-- `affiliate_allowed` (canal D2) reste RÉSERVÉ à l'admin via la RPC
-- `set_category_affiliate_allowed` (mig 082, inchangée). AUCUNE capacité de ce
-- système n'ouvre le canal affilié. `service_role` jamais exposé au client.
--
-- AUDIT : toute attribution/retrait écrit une ligne IMMUABLE append-only
-- (qui, à qui, quelle capacité, quand). 100 % ADDITIF, réversible.
-- =============================================================================

-- ── 1. Table des permissions attribuées (1 ligne = 1 capacité accordée) ───────
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  capability  text        NOT NULL,
  granted_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_permissions_user_cap_unique UNIQUE (user_id, capability),
  -- Allowlist des capacités connues. ÉTENDRE ICI (+ code guard) pour en ajouter.
  CONSTRAINT staff_permissions_capability_known CHECK (
    capability IN ('validate_categories')
  )
);

-- Lookup principal : « cet utilisateur a-t-il CETTE capacité ? » (couvert par UNIQUE).
-- Index inverse : « qui a CETTE capacité ? » (panneau admin L5).
CREATE INDEX IF NOT EXISTS idx_staff_permissions_capability
  ON public.staff_permissions (capability);

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- Admin gère tout (FOR ALL). Le salarié LIT ses propres permissions (awareness UI).
-- Écriture réelle = RPC SECURITY DEFINER auditée (ci-dessous) ; pas de policy
-- INSERT/UPDATE/DELETE pour le salarié → deny par défaut.
DROP POLICY IF EXISTS "staff_permissions_admin_all" ON public.staff_permissions;
CREATE POLICY "staff_permissions_admin_all"
  ON public.staff_permissions
  FOR ALL TO authenticated
  USING      (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "staff_permissions_self_read" ON public.staff_permissions;
CREATE POLICY "staff_permissions_self_read"
  ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 2. Audit IMMUABLE append-only des attributions/retraits ───────────────────
CREATE TABLE IF NOT EXISTS public.staff_permission_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL CHECK (action IN ('grant', 'revoke')),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  capability  text        NOT NULL,
  changed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_permission_audit_user
  ON public.staff_permission_audit (user_id, changed_at DESC);

ALTER TABLE public.staff_permission_audit ENABLE ROW LEVEL SECURITY;

-- Lecture admin-only. Aucune policy d'écriture → INSERT via RPC definer only.
DROP POLICY IF EXISTS "staff_permission_audit_admin_read" ON public.staff_permission_audit;
CREATE POLICY "staff_permission_audit_admin_read"
  ON public.staff_permission_audit
  FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- Immuabilité : UPDATE/DELETE rejetés pour TOUS (y compris definer/service_role).
CREATE OR REPLACE FUNCTION public.staff_permission_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'staff_permission_audit est append-only (ni UPDATE ni DELETE)';
END $$;

DROP TRIGGER IF EXISTS trg_staff_permission_audit_immutable ON public.staff_permission_audit;
CREATE TRIGGER trg_staff_permission_audit_immutable
  BEFORE UPDATE OR DELETE ON public.staff_permission_audit
  FOR EACH ROW EXECUTE FUNCTION public.staff_permission_audit_immutable();

-- ── 3. has_capability() — utilisable en RLS (équivalent ciblé de my_role()) ───
-- L'admin possède TOUTES les capacités (superuser applicatif). Sinon : la ligne
-- staff_permissions doit exister. SECURITY DEFINER pour franchir la RLS de la
-- table depuis une policy d'une AUTRE table sans récursion.
CREATE OR REPLACE FUNCTION public.has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.staff_permissions
       WHERE user_id = auth.uid()
         AND capability = p_capability
    );
$$;

REVOKE ALL ON FUNCTION public.has_capability(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated;

-- ── 4. RPC grant/revoke — SEUL chemin d'écriture, gate admin + audit ──────────
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
  IF p_capability NOT IN ('validate_categories') THEN
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

CREATE OR REPLACE FUNCTION public.revoke_staff_permission(
  p_user_id    uuid,
  p_capability text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  DELETE FROM public.staff_permissions
   WHERE user_id = p_user_id AND capability = p_capability;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Idempotent : rien à retirer → pas d'audit.
  IF v_deleted > 0 THEN
    INSERT INTO public.staff_permission_audit (action, user_id, capability, changed_by)
    VALUES ('revoke', p_user_id, p_capability, v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.revoke_staff_permission(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_staff_permission(uuid, text) TO authenticated;

COMMENT ON TABLE public.staff_permissions IS
  'Permissions granulaires attribuables/retirables par l''admin à un salarié '
  '(toggle réversible). Capacité initiale validate_categories. Admin = toutes les '
  'capacités (has_capability). Écriture via RPC grant/revoke (gate admin + audit '
  'immuable) ; le salarié lit seulement ses propres lignes. N''ouvre JAMAIS le '
  'canal affilié (affiliate_allowed reste admin-only, mig 082).';
