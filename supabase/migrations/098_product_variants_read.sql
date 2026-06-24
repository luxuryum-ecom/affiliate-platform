-- =============================================================================
-- Migration 098 — VUE CLIENT product_variants_read (Étape 3 : affichage variantes)
-- =============================================================================
-- Réf : docs/ROADMAP_MASTER.md (Étape 3).
--
-- PÉRIMÈTRE STRICT — ADDITIF, ZÉRO FINANCE, ZÉRO RISQUE :
--   La table `product_variants` (mig 096) est en RLS staff-only (admin/agent/manage_stock).
--   Pour que les pages CLIENT (public /products/[id], affilié, grossiste) puissent afficher
--   le choix de variante (taille/couleur…), on expose une VUE redacted lisible par anon +
--   authenticated — MÊME pattern que products_public_read (mig 072) / products_catalog_read (089).
--
--   • Lignes filtrées : variante active, d'un produit actif + approuvé (corrige l'observation
--     @security : ne jamais exposer une variante d'un produit inactif).
--   • Colonnes whitelistées : aucune donnée sensible (les variantes ne portent NI prix NI
--     coût NI marge — que des attributs + stock). stock_count exposé comme products_public_read.
--   • security_invoker au DÉFAUT (false/definer), comme les autres vues redacted : la vue
--     renvoie les lignes filtrées indépendamment de la RLS staff-only de la table de base.
--     Sûr ici car colonnes non sensibles + filtrage strict des lignes.
--
-- N'affecte NI la table de base, NI la finance, NI les commandes/panier. Idempotente.
-- =============================================================================

CREATE OR REPLACE VIEW public.product_variants_read AS
  SELECT
    v.id,
    v.product_id,
    v.attributes,       -- paires axe→valeur flexibles (ex {"taille":"T1","couleur":"rouge"})
    v.is_default,
    v.stock_count,      -- quantité de stock (pas un montant) — cohérent avec products_public_read
    v.active
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.active = true
    AND p.active = true
    AND p.approval_status = 'approved';

-- Verrou explicite : Supabase accorde par défaut ALL (INSERT/UPDATE/DELETE…) à anon/authenticated
-- sur tout nouvel objet de public. On REVOKE tout puis on ne RE-GRANT que SELECT — défense en
-- profondeur (la vue a un JOIN donc n'est pas auto-updatable, mais on ne s'appuie pas dessus).
REVOKE ALL ON public.product_variants_read FROM anon, authenticated;
GRANT SELECT ON public.product_variants_read TO anon, authenticated;

COMMENT ON VIEW public.product_variants_read IS
  'Vue CLIENT des variantes (Étape 3, mig 098) : variantes ACTIVES de produits ACTIFS+APPROUVÉS. '
  'Colonnes whitelistées (id, product_id, attributes, is_default, stock_count, active) — '
  'AUCUNE donnée financière (les variantes ne portent que stock + attributs). '
  'Pattern redacted identique à products_public_read (072). security_invoker volontairement au '
  'défaut (false) : lignes filtrées strictement, colonnes non sensibles.';
