-- =============================================================================
-- Migration 075 — Vue catalogue grossiste UNIFIÉ : wholesale_catalog_read
-- =============================================================================
-- But : le grossiste voit TOUT le disponible Maroc dans un catalogue unique
-- (stock interne Mozouna + produits fournisseurs), scindé par disponibilité
-- (local_stock / import_on_demand) côté page. La SOURCE (interne vs fournisseur)
-- est exposée UNIQUEMENT pour router le lien détail côté serveur — jamais rendue
-- au client comme information fournisseur.
--
-- CLOISONNEMENT (RÈGLE D'OR) : aucune donnée fournisseur/coût/marge ne peut fuir.
--   • Branche INTERNE : lit `products_public_read` (vue WHITELISTÉE de la mig. 072),
--     qui EXCLUT déjà factory_cost_mad, purchase_price*, margin_percentage,
--     calculated_sale_price_mad, platform_margin_*, commission_amount, supplier_id/name,
--     source_supplier_product_id. Impossible d'exposer une colonne sensible : elles
--     n'existent pas dans la vue source.
--   • Branche FOURNISSEUR : lit `supplier_products_wholesaler_read` (mig. 045/068),
--     déjà redacted (exclut supplier_id, coût, marge, notes privées) et déjà gated
--     (approved + non archivé + rôle wholesaler / wholesale_access).
--
-- ARGENT : ZÉRO recalcul. `from_price_mad` ne fait que SÉLECTIONNER un prix DÉJÀ
--   STOCKÉ — interne = plus bas `price_per_unit` des paliers (fallback `sell_price`),
--   fournisseur = `suggested_wholesale_price_mad`. Aucune marge/commission/ledger touché.
--
-- security_invoker : laissé au DÉFAUT (false) — même modèle que products_public_read
--   et supplier_products_wholesaler_read (la vue source fournisseur s'exécute avec les
--   droits du propriétaire). Le rôle est évalué via my_role()/auth.uid() (lecture du JWT
--   de l'appelant) dans le WHERE de la vue source fournisseur.
-- =============================================================================

CREATE OR REPLACE VIEW public.wholesale_catalog_read AS

  -- ── Branche INTERNE (stock Mozouna) — via la whitelist publique (mig. 072) ──
  SELECT
    pr.id,
    'internal'::text                                            AS source,
    pr.name::text                                               AS name,
    pr.description::text                                        AS description,
    COALESCE(
      (
        SELECT MIN((tier->>'price_per_unit')::numeric)
        FROM jsonb_array_elements(pr.wholesale_tiers) AS tier
        WHERE pr.wholesale_tiers IS NOT NULL
          AND jsonb_typeof(pr.wholesale_tiers) = 'array'
      ),
      pr.sell_price
    )::numeric                                                  AS from_price_mad,
    pr.wholesale_min_qty::integer                               AS min_qty,
    pr.stock_count::integer                                     AS stock,
    COALESCE(pr.images->>0, pr.media->0->>'url')::text          AS image,
    pr.category::text                                           AS category,
    pr.subcategory::text                                        AS subcategory,
    pr.origin_country::text                                     AS origin_country,
    pr.availability_type::text                                  AS availability_type,
    false::boolean                                              AS is_featured,
    false::boolean                                              AS is_verified,
    pr.created_at                                               AS created_at
  FROM public.products_public_read pr

  UNION ALL

  -- ── Branche FOURNISSEUR — via la vue déjà redacted + gated (mig. 045/068) ──
  SELECT
    sp.id,
    'supplier'::text                                            AS source,
    COALESCE(sp.public_name, sp.product_name)::text             AS name,
    COALESCE(sp.public_description, sp.description)::text        AS description,
    sp.suggested_wholesale_price_mad::numeric                   AS from_price_mad,
    sp.min_quantity::integer                                    AS min_qty,
    sp.stock_quantity::integer                                  AS stock,
    (sp.photos->>0)::text                                       AS image,
    sp.category::text                                           AS category,
    sp.subcategory::text                                        AS subcategory,
    sp.origin_country::text                                     AS origin_country,
    sp.availability_type::text                                  AS availability_type,
    sp.is_featured::boolean                                     AS is_featured,
    sp.is_verified::boolean                                     AS is_verified,
    sp.created_at                                               AS created_at
  FROM public.supplier_products_wholesaler_read sp;

-- Catalogue grossiste — réservé aux comptes authentifiés (jamais anon).
GRANT SELECT ON public.wholesale_catalog_read TO authenticated;

COMMENT ON VIEW public.wholesale_catalog_read IS
  'Catalogue grossiste UNIFIÉ (interne products_public_read ∪ supplier_products_wholesaler_read). '
  'Colonne `source` (internal|supplier) = routage détail SERVEUR uniquement, JAMAIS exposée au client. '
  'EXCLUT tout coût/marge/supplier_id (les vues sources sont déjà whitelistées). '
  '`from_price_mad` = prix de vente déjà stocké (plus bas palier / suggested), aucun recalcul. '
  'security_invoker au défaut (false), volontaire. GRANT authenticated uniquement.';
