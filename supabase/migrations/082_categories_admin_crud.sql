-- =============================================================================
-- Migration 082 — Panneau admin catégories : RLS écriture + canal audité (SOUS-LOT 4)
-- =============================================================================
-- Ouvre l'ÉCRITURE de la table `categories` (mig 081) à l'admin, via RLS admin-only,
-- pour le CRUD normal (nom, i18n, icône, image, ordre, active, sous-catégories).
--
-- POINT SENSIBLE (argent) : `affiliate_allowed` décide du CANAL (D2). Sa modification
-- est VERROUILLÉE :
--   1. Un TRIGGER interdit à tout rôle client (authenticated/anon) de changer
--      `affiliate_allowed` (INSERT à true OU UPDATE qui le modifie) → impossible de
--      basculer le canal via PostgREST, même avec un JWT admin (bypass du circuit).
--   2. Seule la RPC `set_category_affiliate_allowed` (SECURITY DEFINER, gate admin)
--      peut le changer — ATOMIQUEMENT avec l'écriture d'une ligne d'AUDIT IMMUABLE.
--   3. Décision POSITIVE : la RPC exige un booléen explicite (jamais null).
-- Conséquence : une catégorie créée par l'admin naît `affiliate_allowed=false`
-- (grossiste, fail-closed) ; passer en affilié = action auditée dédiée.
--
-- `'Autres'` (fail-safe de normalizeCategory) est protégée : ni suppression ni
-- désactivation. 100 % ADDITIF, réversible.
-- =============================================================================

-- ── 1. Table d'AUDIT IMMUABLE des changements de canal (append-only) ──────────
CREATE TABLE IF NOT EXISTS public.category_channel_audit (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  category_slug text        NOT NULL,
  old_value     boolean     NOT NULL,
  new_value     boolean     NOT NULL,
  changed_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_channel_audit_cat
  ON public.category_channel_audit (category_id, changed_at DESC);

ALTER TABLE public.category_channel_audit ENABLE ROW LEVEL SECURITY;

-- Lecture admin-only. Aucune policy d'écriture → INSERT via RPC SECURITY DEFINER only.
DROP POLICY IF EXISTS "category_channel_audit_admin_read" ON public.category_channel_audit;
CREATE POLICY "category_channel_audit_admin_read"
  ON public.category_channel_audit
  FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- Immuabilité : UPDATE/DELETE rejetés pour TOUS (y compris definer/service_role).
CREATE OR REPLACE FUNCTION public.category_channel_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'category_channel_audit est append-only (ni UPDATE ni DELETE)';
END $$;

DROP TRIGGER IF EXISTS trg_category_channel_audit_immutable ON public.category_channel_audit;
CREATE TRIGGER trg_category_channel_audit_immutable
  BEFORE UPDATE OR DELETE ON public.category_channel_audit
  FOR EACH ROW EXECUTE FUNCTION public.category_channel_audit_immutable();

-- ── 2. Garde : `affiliate_allowed` non modifiable par un rôle client ──────────
-- Seule la RPC auditée (definer, current_user = propriétaire) peut le changer.
CREATE OR REPLACE FUNCTION public.categories_guard_affiliate_allowed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND NEW.affiliate_allowed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'affiliate_allowed ne peut être activé que via la server action auditée';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.affiliate_allowed IS DISTINCT FROM OLD.affiliate_allowed THEN
      RAISE EXCEPTION 'affiliate_allowed ne peut être modifié que via la server action auditée';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categories_guard_affiliate ON public.categories;
CREATE TRIGGER trg_categories_guard_affiliate
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_guard_affiliate_allowed();

-- ── 3. Protection de la catégorie système 'Autres' ───────────────────────────
CREATE OR REPLACE FUNCTION public.categories_protect_system()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.slug = 'Autres' AND OLD.parent_id IS NULL THEN
      RAISE EXCEPTION 'La catégorie système « Autres » ne peut pas être supprimée';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE : interdiction de désactiver 'Autres'
  IF OLD.slug = 'Autres' AND OLD.parent_id IS NULL AND NEW.active = false THEN
    RAISE EXCEPTION 'La catégorie système « Autres » ne peut pas être désactivée';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categories_protect_system ON public.categories;
CREATE TRIGGER trg_categories_protect_system
  BEFORE UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_protect_system();

-- ── 4. RLS écriture admin-only sur `categories` (CRUD hors affiliate_allowed) ─
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

DROP POLICY IF EXISTS "categories_admin_insert" ON public.categories;
CREATE POLICY "categories_admin_insert"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "categories_admin_update" ON public.categories;
CREATE POLICY "categories_admin_update"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "categories_admin_delete" ON public.categories;
CREATE POLICY "categories_admin_delete"
  ON public.categories FOR DELETE TO authenticated
  USING (public.my_role() = 'admin');

-- ── 5. RPC ATOMIQUE : changer le canal + tracer l'audit (le SEUL chemin) ──────
CREATE OR REPLACE FUNCTION public.set_category_affiliate_allowed(
  p_category_id uuid,
  p_allowed     boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old    boolean;
  v_slug   text;
  v_parent uuid;
  v_actor  uuid := auth.uid();
BEGIN
  -- Gate admin (le SECURITY DEFINER ne doit pas ouvrir la fonction à tous).
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  -- Décision POSITIVE : booléen explicite obligatoire (jamais null/élargissement).
  IF p_allowed IS NULL THEN
    RAISE EXCEPTION 'affiliate_allowed doit être un booléen explicite';
  END IF;

  SELECT affiliate_allowed, slug, parent_id
    INTO v_old, v_slug, v_parent
    FROM public.categories
   WHERE id = p_category_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catégorie introuvable';
  END IF;
  -- Le canal (D2) ne se définit que sur une catégorie PARENTE.
  IF v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Le canal ne se définit que sur une catégorie parente';
  END IF;

  -- Idempotent : sans changement réel, aucune écriture ni audit.
  IF v_old IS DISTINCT FROM p_allowed THEN
    UPDATE public.categories
       SET affiliate_allowed = p_allowed, updated_at = now()
     WHERE id = p_category_id;
    INSERT INTO public.category_channel_audit
      (category_id, category_slug, old_value, new_value, changed_by)
    VALUES (p_category_id, v_slug, v_old, p_allowed, v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_category_affiliate_allowed(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_category_affiliate_allowed(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.set_category_affiliate_allowed(uuid, boolean) IS
  'SEUL chemin pour changer affiliate_allowed (canal D2) : gate admin, booléen '
  'explicite, UPDATE + audit immuable atomiques. Le trigger guard bloque tout '
  'autre chemin (rôle client). Lecture D2 (products.ts) reste fraîche fail-closed.';
