-- =============================================================================
-- Migration 116 — Fermeture des 2 fuites de marge OWNER-FACING (E1 + M1)
-- =============================================================================
-- RLS Postgres filtre les LIGNES, pas les COLONNES. Patron projet (cf. 045/060/
-- 063/064/115) : retirer la policy base-table pour le rôle NON-STAFF concerné et
-- servir une VUE redacted qui EMBARQUE son propre filtre de lignes (WHERE ... =
-- auth.uid()). Aucune vue n'expose les colonnes de marge/coût internes.
--
-- E1 — wholesale_orders : la policy base "wholesale_orders: read" (mig 001)
--      contenait une branche `buyer_id = auth.uid()`. Or la RLS étant row-level,
--      l'acheteur pouvait lire via l'API REST TOUTE la ligne, donc les colonnes
--      internes supplier_cost_mad / total_cost_mad / gross_profit_mad /
--      gross_margin_percent / delivery_cost_mad (marge Mozouna sur SA commande).
--      La vue redacted acheteur `wholesale_orders_buyer_read` (mig 063/064)
--      existe déjà et n'expose AUCUNE de ces colonnes — le code applicatif y est
--      repointé. On retire donc la branche acheteur de la policy base : SELECT
--      base réservé STAFF (agent assigné + admin), exactement comme le fournisseur
--      a été retiré en mig 060.
--
-- M1 — supplier_products : la policy base "supplier_products: supplier read own"
--      (mig 030) contenait `supplier_id = auth.uid()`. Idem : le fournisseur
--      pouvait lire via REST toute la ligne de SA fiche, donc platform_margin_value
--      / platform_margin_type / apply_platform_margin / final_wholesale_price_mad
--      (la marge plateforme Mozouna ajoutée par-dessus son prix). On crée une vue
--      redacted OWNER `supplier_products_owner_read` (colonnes de gestion du
--      fournisseur, SANS aucune colonne de marge/coût interne ni de modération) et
--      on retire la branche fournisseur de la base (SELECT base réservé STAFF).
--
-- Idempotente. AUCUNE donnée modifiée. AUCUN calcul de prix / commission / marge
-- touché (tous calculés côté serveur via service_role, inchangés). Contrôle
-- d'accès PUR.
--
-- 🛑 SÉQUENCEMENT (lockstep) — la base Supabase est PARTAGÉE prod/branches :
--    APPLIQUER CETTE MIGRATION **APRÈS** le déploiement Vercel du code repointé
--    (les lectures acheteur/fournisseur doivent déjà pointer sur les vues). Séquence :
--    (1) merge → main, (2) déploiement Vercel terminé, (3) exécuter ce SQL dans
--    Supabase → SQL Editor. L'appliquer AVANT le déploiement viderait les écrans
--    acheteur (dashboard/commandes) et fournisseur (mes produits) — aucune perte
--    de données, mais régression d'affichage. Donc lockstep.
-- =============================================================================

-- ── E1 : wholesale_orders — SELECT base réservé STAFF (retrait branche acheteur) ─
-- L'acheteur lit EXCLUSIVEMENT via la vue redacted wholesale_orders_buyer_read
-- (mig 063/064 ; WHERE buyer_id = auth.uid() ; sans colonnes coût/marge). Les
-- écritures acheteur (INSERT commande, notes, annulation) passent par leurs propres
-- policies INSERT/UPDATE, non touchées ici. Le service_role (calculs, création admin)
-- bypass la RLS — intact.
DROP POLICY IF EXISTS "wholesale_orders: read" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: read"
  ON public.wholesale_orders FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR public.my_role() = 'admin'
  );
COMMENT ON POLICY "wholesale_orders: read" ON public.wholesale_orders IS
  'SELECT base réservé STAFF (agent assigné / admin). L''acheteur lit via la vue '
  'redacted wholesale_orders_buyer_read (mig 063/064) — jamais les colonnes '
  'supplier_cost_mad / total_cost_mad / gross_profit_mad / gross_margin_percent. '
  'Retrait de la branche buyer_id = auth.uid() (fuite E1). Symétrique de la mig 060 '
  '(fournisseur). Aucun montant modifié.';

-- ── M1 : supplier_products — SELECT base réservé STAFF + vue redacted OWNER ──────
-- Retrait de la branche fournisseur. L'admin conserve son accès base (pages de
-- modération /admin/supplier-products). Le fournisseur lit SA fiche via la vue
-- redacted supplier_products_owner_read (ci-dessous). Écritures fournisseur =
-- policies INSERT/UPDATE existantes (submit/update own pending) + service_role
-- (soumission/stock via createAdminClient), non touchées.
DROP POLICY IF EXISTS "supplier_products: supplier read own" ON public.supplier_products;
CREATE POLICY "supplier_products: admin read"
  ON public.supplier_products FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');
COMMENT ON POLICY "supplier_products: admin read" ON public.supplier_products IS
  'SELECT base réservé ADMIN (modération). Le fournisseur lit SA fiche via la vue '
  'redacted supplier_products_owner_read (sans platform_margin_* ni '
  'final_wholesale_price_mad). Retrait de la branche supplier_id = auth.uid() '
  '(fuite M1). Le grossiste lit déjà via supplier_products_wholesaler_read (mig '
  '045/068). Aucun montant modifié.';

-- Vue redacted OWNER fournisseur : colonnes de GESTION de sa propre fiche,
-- filtre de lignes embarqué (supplier_id = auth.uid()). EXCLUT explicitement :
-- platform_margin_value/_type, apply_platform_margin, final_wholesale_price_mad
-- (marge Mozouna), price_source (coût converti), ai_risk_score / moderation_* /
-- admin_notes (modération interne). Le fournisseur voit SON prix suggéré
-- (suggested_wholesale_price_mad) qu'il a lui-même soumis — pas un secret.
CREATE OR REPLACE VIEW public.supplier_products_owner_read AS
SELECT
  sp.id,
  sp.supplier_id,
  sp.product_name,
  sp.category,
  sp.origin_country,
  sp.min_quantity,
  sp.suggested_wholesale_price_mad,
  sp.source_currency,
  sp.fx_rate_source_to_mad,
  sp.supplier_type,
  sp.approval_status,
  sp.created_at,
  sp.stock_quantity,
  sp.stock_mode,
  sp.stock_quantity_updated_at,
  sp.archived_at
FROM public.supplier_products sp
WHERE sp.supplier_id = auth.uid();

REVOKE ALL  ON public.supplier_products_owner_read FROM anon, authenticated;
GRANT SELECT ON public.supplier_products_owner_read TO authenticated;
COMMENT ON VIEW public.supplier_products_owner_read IS
  'Vue redacted OWNER du fournisseur sur SES propres fiches (WHERE supplier_id = '
  'auth.uid()). Colonnes de gestion UNIQUEMENT — AUCUNE colonne de marge/coût '
  'interne (platform_margin_*, final_wholesale_price_mad, price_source) ni de '
  'modération (ai_risk_score, moderation_*, admin_notes). Remplace la branche '
  'fournisseur de la policy base "supplier_products: supplier read own" (fuite M1).';
