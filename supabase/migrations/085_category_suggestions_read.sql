-- =============================================================================
-- Migration 085 — lecture file de validation pour valideurs non-admin  (L4)
-- =============================================================================
-- Un valideur (capacité `validate_categories`, mig 083) n'est PAS admin : la RLS
-- de `supplier_products` (mig 030) ne lui donne AUCUN accès aux fiches en
-- `pending_review`. Pour afficher la file, on expose une lecture DÉDIÉE
-- SECURITY DEFINER qui ne révèle QUE des champs d'AFFICHAGE non sensibles
-- (nom, photo, catégorie courante) — JAMAIS de coût, marge, prix, ni PII.
-- Gate : has_capability('validate_categories'). Pattern « vue redacted ».
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_pending_category_suggestions()
RETURNS TABLE (
  suggestion_id        uuid,
  proposed_label       text,
  created_at           timestamptz,
  supplier_product_id  uuid,
  product_name         text,
  product_photo        text,
  current_category     text,
  current_subcategory  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_capability('validate_categories') THEN
    RAISE EXCEPTION 'Permission requise : validate_categories';
  END IF;

  RETURN QUERY
    SELECT
      cs.id,
      cs.proposed_label,
      cs.created_at,
      sp.id,
      sp.product_name,
      CASE WHEN array_length(sp.photos, 1) >= 1 THEN sp.photos[1] ELSE NULL END,
      sp.category,
      sp.subcategory
    FROM public.category_suggestions cs
    JOIN public.supplier_products sp ON sp.id = cs.supplier_product_id
    WHERE cs.status = 'pending'
    ORDER BY cs.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_pending_category_suggestions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_category_suggestions() TO authenticated;

COMMENT ON FUNCTION public.list_pending_category_suggestions() IS
  'Lecture de la file de validation pour les porteurs de validate_categories '
  '(mig 083), non-admin inclus. N''expose QUE des champs d''affichage non '
  'sensibles (nom, photo, catégorie) — jamais coût/marge/prix/PII. Gate capacité.';
