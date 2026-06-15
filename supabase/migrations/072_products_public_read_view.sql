-- Migration 072 — Ferme la dette 012 : coût/marge de `products` exposés à ANON.
-- ADDITIF + sécurisant. Aucune donnée modifiée. Policies authenticated/admin INCHANGÉES.
--
-- Problème : la policy `"products: anon read active"` (migrations 004/012) autorise l'anon à
-- lire la table — mais la RLS filtre les LIGNES, pas les COLONNES → un visiteur anon (clé
-- publique) peut lire factory_cost_mad, purchase_price(_mad), margin_percentage,
-- calculated_sale_price_mad, platform_margin_type/value, estimated_*_mad, commission_amount,
-- supplier_id/name, source_supplier_product_id → déduction de la marge plateforme.
--
-- Correctif : une VUE publique WHITELISTÉE (colonnes sûres uniquement) + retrait de l'accès
-- anon à la table de base. Seul lecteur anon = la page publique /products/[id], repointée
-- sur cette vue. Pattern identique aux vues redacted de la migration 045.
--
-- ⚠️ security_invoker reste au DÉFAUT Postgres (false) : la vue s'exécute avec les droits du
-- PROPRIÉTAIRE et renvoie donc les lignes même après le DROP de la policy anon (l'anon n'a
-- accès qu'aux colonnes énumérées ci-dessous, jamais aux colonnes sensibles). NE PAS passer en
-- security_invoker=true (cela viderait la page publique).

CREATE OR REPLACE VIEW public.products_public_read AS
  SELECT
    id,
    name,
    description,
    sell_price,
    wholesale_tiers,
    wholesale_min_qty,
    stock_count,
    images,
    media,
    category,
    subcategory,
    origin_country,
    availability_type,
    affiliate_enabled,
    created_at
  FROM public.products
  WHERE active = true
    AND approval_status = 'approved';

GRANT SELECT ON public.products_public_read TO anon, authenticated;

COMMENT ON VIEW public.products_public_read IS
  'Vue publique whitelistée du catalogue (page /products/[id]). EXCLUT toute colonne coût/marge/'
  'sourcing (factory_cost_mad, purchase_price*, margin_percentage, calculated_sale_price_mad, '
  'platform_margin_*, estimated_*_mad, commission_amount, supplier_id/name, source_supplier_product_id). '
  'Ferme la dette 012 (fuite ANON). security_invoker volontairement au défaut (false).';

-- Retrait de l'accès ANON à la TABLE DE BASE : la RLS ne pouvant pas filtrer les colonnes,
-- la seule façon de fermer la fuite est de couper l'accès anon au base table. L'anon passe
-- désormais exclusivement par la vue whitelistée ci-dessus.
DROP POLICY IF EXISTS "products: anon read active" ON public.products;
