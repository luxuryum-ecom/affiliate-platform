-- =============================================================================
-- Migration 089 — Vue redacted `products_catalog_read` (ferme la dette 073, étape 1/2)
-- =============================================================================
-- ADDITIF. Aucune donnée modifiée. SÛR À APPLIQUER IMMÉDIATEMENT (n'enlève aucun
-- accès — la migration 091 resserrera la policy, séparément, AU MERGE).
--
-- Contexte (dette 073, FEUILLE_DE_ROUTE.md l.162) :
--   La policy `"products: authenticated read active"` (001:264 = `active = true OR
--   my_role()='admin'`) laisse TOUT utilisateur authentifié (wholesaler/affiliate/
--   supplier/agent) lire TOUTES les colonnes de `products` — la RLS filtre les LIGNES,
--   pas les COLONNES → fuite de factory_cost_mad / platform_margin_* / purchase_price* /
--   margin_percentage / calculated_sale_price_mad / estimated_cost_mad / supplier_id…
--
-- Correctif (même pattern que mig 072 `products_public_read`, validé) :
--   1. (089, ICI) Une VUE WHITELISTÉE des colonnes vitrine/affichage SÛRES, lisible par
--      `authenticated`. Tous les reads NON-ADMIN du code sont repointés dessus.
--   2. (091, AU MERGE) Resserrer la policy base-table à admin-only — UNE FOIS le code
--      repointé déployé (sinon le site live casserait). Le calcul de commission n'est
--      PAS impacté : il lit le coût via service_role (createAdminClient), qui bypasse RLS.
--
-- ⚠️ security_invoker reste au DÉFAUT (false) : la vue s'exécute avec les droits du
-- PROPRIÉTAIRE → renvoie les lignes même après le resserrage 091 (l'authenticated n'a
-- accès qu'aux colonnes énumérées, jamais aux colonnes sensibles). NE PAS passer en true.
--
-- WHITELIST = colonnes d'AFFICHAGE/vitrine uniquement. EXCLUT explicitement :
--   factory_cost_mad, platform_margin_type/value, purchase_price, purchase_price_mad,
--   purchase_currency, exchange_rate_to_mad, margin_percentage, calculated_sale_price_mad,
--   estimated_cost_mad, supplier_id, supplier_name, source_notes, source_type, submitted_by,
--   submitted_via, approved_by, import_notes.
-- INCLUT commission_amount + fees (frais COD = donnée vitrine affilié, non sensible) et
-- active/approval_status/affiliate_enabled (pour que les filtres `.eq(...)` des appelants
-- restent inchangés → repointage = simple swap `from('products')` → `from('products_catalog_read')`).
-- =============================================================================

CREATE OR REPLACE VIEW public.products_catalog_read AS
  SELECT
    id,
    name,
    description,
    sell_price,
    commission_amount,
    wholesale_tiers,
    wholesale_min_qty,
    stock_count,
    images,
    media,
    category,
    subcategory,
    origin_country,
    origin_detail,
    availability_type,
    affiliate_enabled,
    active,
    approval_status,
    confirmation_fee_mad,
    packaging_fee_mad,
    delivery_fee_mad,
    delivery_fee_config,
    estimated_delivery_days,
    estimated_import_price_mad,
    import_pricing_mode,
    import_price_unit,
    import_shipping_mode,
    tariff_mode,
    sale_unit,
    pack_size,
    pack_unit,
    source_supplier_product_id,
    created_at
  FROM public.products
  WHERE active = true
    AND approval_status = 'approved';

GRANT SELECT ON public.products_catalog_read TO authenticated;

COMMENT ON VIEW public.products_catalog_read IS
  'Vue redacted du catalogue pour les rôles NON-ADMIN authentifiés (affilié/grossiste/'
  'fournisseur). EXCLUT coût/marge/sourcing (factory_cost_mad, platform_margin_*, '
  'purchase_price*, margin_percentage, calculated_sale_price_mad, estimated_cost_mad, '
  'supplier_id/name, source_notes…). Ferme la dette 073 (étape 1/2 ; 091 resserre la '
  'policy base-table au merge). security_invoker au défaut (false). Le calcul de '
  'commission lit le coût via service_role, non via cette vue.';
