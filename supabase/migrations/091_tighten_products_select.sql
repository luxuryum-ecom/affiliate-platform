-- =============================================================================
-- Migration 091 — Resserrage policy SELECT `products` → ADMIN-ONLY (dette 073, étape 2/2)
-- =============================================================================
-- 🛑 NE PAS APPLIQUER SUR LA BRANCHE / TANT QUE LE CODE REPOINTÉ N'EST PAS DÉPLOYÉ.
-- ⚠️ À APPLIQUER **AU MERGE**, EN LOCKSTEP AVEC LE DÉPLOIEMENT VERCEL du code repointé.
--    La base Supabase est PARTAGÉE entre `main` (prod live) et les branches : appliquer
--    ce resserrage AVANT que le code de `main` lise via les vues casserait le site live
--    (les pages affilié/grossiste/fournisseur de `main` lisent encore `products` en direct).
--    Séquence go-live : (1) merge `feat/durcissement-beta-vitrine` → main, (2) déploiement
--    Vercel terminé, (3) `supabase db push` (applique 091), (4) vérif runtime.
--
-- Effet : la table de base `products` n'est plus lisible que par l'admin. Tous les reads
-- NON-ADMIN du code passent désormais par :
--   - `products_public_read`  (mig 072, anon + authenticated) — page publique
--   - `products_catalog_read` (mig 089, authenticated) — affilié/grossiste/fournisseur
--   - `wholesale_catalog_read` / `supplier_products_wholesaler_read` (vues déjà redacted)
--   - service_role (createAdminClient) pour les calculs serveur (commission) — bypasse RLS,
--     INCHANGÉ → le calcul de commission n'est PAS impacté.
--
-- Les policies INSERT/UPDATE/DELETE (admin-only, WITH CHECK) ne sont PAS touchées.
-- =============================================================================

-- STAFF INTERNE (admin + agent) : conservent l'accès base-table. Les agents sont admis
-- dans les pages (admin) (layout:31) et y lisaient déjà products (statu quo) ; comptes
-- internes attribués par l'admin (rôle non auto-déclarable, mig 090), PAS la cible de la
-- dette 073 (qui vise les CLIENTS externes : grossiste/affilié/fournisseur). La fuite est
-- fermée pour les rôles externes tout en évitant une régression d'accès staff (@security P2).
DROP POLICY IF EXISTS "products: authenticated read active" ON public.products;
CREATE POLICY "products: staff read"
  ON public.products FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

COMMENT ON POLICY "products: staff read" ON public.products IS
  'SELECT base-table réservé STAFF INTERNE (admin/agent) (dette 073, étape 2/2, mig 091). '
  'Les rôles CLIENTS (grossiste/affilié/fournisseur) lisent via products_public_read / '
  'products_catalog_read (redacted, sans coût/marge). Les calculs serveur (commission) '
  'lisent via service_role. Appliqué AU MERGE, en lockstep avec le déploiement.';
