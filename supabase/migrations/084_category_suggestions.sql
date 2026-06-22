-- =============================================================================
-- Migration 084 — category_suggestions : file de validation de catégories  (L2)
-- =============================================================================
-- Quand l'IA d'ingestion ne trouve AUCUNE catégorie correspondante, au lieu de se
-- contenter du fail-safe `'Autres'`, elle PROPOSE un nom de catégorie. Le produit
-- garde `'Autres'` (filet sécurité INTOUCHÉ) et reste pleinement utilisable/visible
-- (JAMAIS bloqué) ; la proposition est rangée dans cette FILE DE VALIDATION en
-- SIDECAR. Un valideur (capacité `validate_categories`, mig 083) tranche :
--   • CRÉER la nouvelle catégorie (réutilise la logique CRUD admin), puis y ranger
--     le produit ; OU
--   • RANGER le produit dans une catégorie existante ; OU
--   • REJETER (le produit reste sur 'Autres').
--
-- 🛑 ARGENT/CANAL — INTOUCHÉ : une catégorie créée ici naît `affiliate_allowed=false`
-- (grossiste, fail-closed). Le toggle `affiliate_allowed` (canal D2) reste RÉSERVÉ
-- à l'admin via `set_category_affiliate_allowed` (mig 082). Aucun prix/capital/
-- commission n'est touché : on ne fait que (re)classer un produit AVANT approbation.
-- `service_role` jamais exposé ; insertion de suggestion = service_role (ingestion).
-- =============================================================================

-- ── 0. Durcissements mig 083 (findings @security P2, repliés ici) ─────────────
-- P2 : l'audit doit pouvoir ANONYMISER (et non bloquer) la suppression d'un profil.
ALTER TABLE public.staff_permission_audit ALTER COLUMN user_id DROP NOT NULL;

-- P2-1 : has_capability() défensive sur p_capability NULL (deny strict).
CREATE OR REPLACE FUNCTION public.has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.my_role() = 'admin'
    OR (
      p_capability IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.staff_permissions
         WHERE user_id = auth.uid()
           AND capability = p_capability
      )
    );
$$;

-- ── 1. Table de la file de validation (sidecar, ne bloque jamais le produit) ──
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id   uuid        NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  proposed_label        text        NOT NULL,                 -- nom proposé par l'IA (indice)
  source                text        NOT NULL DEFAULT 'telegram_ai',
  status                text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'created', 'filed', 'rejected')),
  resolved_by           uuid        REFERENCES public.profiles(id)   ON DELETE SET NULL,
  resolved_at           timestamptz,
  resulting_category_id uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- File de travail : les suggestions en attente, plus récentes d'abord.
CREATE INDEX IF NOT EXISTS idx_category_suggestions_pending
  ON public.category_suggestions (created_at DESC)
  WHERE status = 'pending';

-- Idempotence : au plus UNE suggestion en attente par produit (l'ingestion peut
-- re-tourner). Une nouvelle suggestion redevient possible après résolution.
CREATE UNIQUE INDEX IF NOT EXISTS category_suggestions_one_pending
  ON public.category_suggestions (supplier_product_id)
  WHERE status = 'pending';

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;

-- Lecture : admin OU porteur de la capacité `validate_categories`. Aucune policy
-- d'écriture cliente → résolution via RPC definer, insertion via service_role.
DROP POLICY IF EXISTS "category_suggestions_validator_read" ON public.category_suggestions;
CREATE POLICY "category_suggestions_validator_read"
  ON public.category_suggestions
  FOR SELECT TO authenticated
  USING (public.has_capability('validate_categories'));

-- ── 2. RPC : CRÉER une nouvelle catégorie + y ranger le produit ───────────────
-- Capability-gated. La catégorie naît affiliate_allowed=false (jamais fournie).
CREATE OR REPLACE FUNCTION public.validator_create_category(
  p_suggestion_id uuid,
  p_label_fr      text,
  p_label_ar      text,
  p_label_en      text,
  p_parent_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_fr          text := nullif(btrim(p_label_fr), '');
  v_ar          text := nullif(btrim(p_label_ar), '');
  v_en          text := nullif(btrim(p_label_en), '');
  v_sp          uuid;
  v_status      text;
  v_new_cat     uuid;
  v_parent_slug text;
  v_parent_pid  uuid;
BEGIN
  IF NOT public.has_capability('validate_categories') THEN
    RAISE EXCEPTION 'Permission requise : validate_categories';
  END IF;
  IF v_fr IS NULL OR v_ar IS NULL OR v_en IS NULL THEN
    RAISE EXCEPTION 'Les libellés FR, AR et EN sont requis';
  END IF;

  -- Verrouille la suggestion ; doit être en attente.
  SELECT supplier_product_id, status INTO v_sp, v_status
    FROM public.category_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà traitée (%)' , v_status;
  END IF;

  -- parent_id éventuel : doit exister ET être une catégorie parente (pas de niveau 3).
  IF p_parent_id IS NOT NULL THEN
    SELECT slug, parent_id INTO v_parent_slug, v_parent_pid
      FROM public.categories WHERE id = p_parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Catégorie parente introuvable';
    END IF;
    IF v_parent_pid IS NOT NULL THEN
      RAISE EXCEPTION 'Une sous-catégorie ne peut pas avoir de sous-catégorie';
    END IF;
  END IF;

  -- Création (slug = nom canonique FR). affiliate_allowed NON fourni → false.
  BEGIN
    INSERT INTO public.categories (slug, parent_id, label_fr, label_ar, label_en)
    VALUES (v_fr, p_parent_id, v_fr, v_ar, v_en)
    RETURNING id INTO v_new_cat;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'La catégorie « % » existe déjà à ce niveau', v_fr;
  END;

  -- Classe le produit. Top-level → category=slug, subcategory=''. Sinon →
  -- category=parent.slug, subcategory=slug.
  IF p_parent_id IS NULL THEN
    UPDATE public.supplier_products
       SET category = v_fr, subcategory = ''
     WHERE id = v_sp;
  ELSE
    UPDATE public.supplier_products
       SET category = v_parent_slug, subcategory = v_fr
     WHERE id = v_sp;
  END IF;

  -- Clôt la suggestion (résolue = créée).
  UPDATE public.category_suggestions
     SET status = 'created', resolved_by = v_actor, resolved_at = now(),
         resulting_category_id = v_new_cat
   WHERE id = p_suggestion_id;

  RETURN v_new_cat;
END $$;

REVOKE ALL ON FUNCTION public.validator_create_category(uuid, text, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validator_create_category(uuid, text, text, text, uuid) TO authenticated;

-- ── 3. RPC : RANGER le produit dans une catégorie EXISTANTE ───────────────────
CREATE OR REPLACE FUNCTION public.validator_resolve_suggestion(
  p_suggestion_id uuid,
  p_category_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       uuid := auth.uid();
  v_sp          uuid;
  v_status      text;
  v_slug        text;
  v_parent_id   uuid;
  v_active      boolean;
  v_parent_slug text;
BEGIN
  IF NOT public.has_capability('validate_categories') THEN
    RAISE EXCEPTION 'Permission requise : validate_categories';
  END IF;

  SELECT supplier_product_id, status INTO v_sp, v_status
    FROM public.category_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà traitée (%)', v_status;
  END IF;

  -- Catégorie cible : doit exister ET être active.
  SELECT slug, parent_id, active INTO v_slug, v_parent_id, v_active
    FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catégorie cible introuvable';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Catégorie cible inactive';
  END IF;

  -- Top-level → category=slug, subcategory=''. Sous-catégorie → category=parent.slug.
  IF v_parent_id IS NULL THEN
    UPDATE public.supplier_products
       SET category = v_slug, subcategory = ''
     WHERE id = v_sp;
  ELSE
    SELECT slug INTO v_parent_slug FROM public.categories WHERE id = v_parent_id;
    UPDATE public.supplier_products
       SET category = v_parent_slug, subcategory = v_slug
     WHERE id = v_sp;
  END IF;

  UPDATE public.category_suggestions
     SET status = 'filed', resolved_by = v_actor, resolved_at = now(),
         resulting_category_id = p_category_id
   WHERE id = p_suggestion_id;
END $$;

REVOKE ALL ON FUNCTION public.validator_resolve_suggestion(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validator_resolve_suggestion(uuid, uuid) TO authenticated;

-- ── 4. RPC : REJETER une suggestion (le produit reste sur 'Autres') ───────────
CREATE OR REPLACE FUNCTION public.validator_reject_suggestion(
  p_suggestion_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_status text;
BEGIN
  IF NOT public.has_capability('validate_categories') THEN
    RAISE EXCEPTION 'Permission requise : validate_categories';
  END IF;

  SELECT status INTO v_status
    FROM public.category_suggestions
   WHERE id = p_suggestion_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà traitée (%)', v_status;
  END IF;

  -- Le produit garde 'Autres' (filet) — aucune écriture sur supplier_products.
  UPDATE public.category_suggestions
     SET status = 'rejected', resolved_by = v_actor, resolved_at = now()
   WHERE id = p_suggestion_id;
END $$;

REVOKE ALL ON FUNCTION public.validator_reject_suggestion(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validator_reject_suggestion(uuid) TO authenticated;

COMMENT ON TABLE public.category_suggestions IS
  'File de validation des catégories proposées par l''IA d''ingestion (sidecar). '
  'Le produit garde ''Autres'' tant que non résolu (jamais bloqué). Lecture = '
  'capacité validate_categories (mig 083). Résolution via RPC definer capability- '
  'gated : create (naît affiliate_allowed=false) / file (cat existante) / reject. '
  'Ne touche ni prix ni canal D2 ; reclasse un supplier_product AVANT approbation.';
