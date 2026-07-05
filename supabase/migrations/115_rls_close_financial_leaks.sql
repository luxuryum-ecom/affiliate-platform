-- =============================================================================
-- Migration 115 — Fermeture de 3 fuites de secrets financiers INTER-ACTEURS
-- =============================================================================
-- RLS est row-level (pas column-level). Le patron projet : retirer la policy
-- base-table pour les rôles NON-STAFF et servir une VUE redacted (cf. 045/068/098).
--
-- C1 — supplier_product_moq_tiers.unit_price_usd (prix source USD fournisseur)
--      lisible en direct par tout grossiste via la policy base "wholesaler read".
-- C2 — supplier_product_variants.price_adjustment_usd, idem.
-- E2 — products : resserrer le SELECT base à STAFF (admin/agent) — reprise de la
--      mig 091 (le code non-staff lit déjà via les vues redacted, vérifié).
-- Idempotente. Aucune donnée modifiée. Aucun calcul de prix touché.
--
-- 🛑 SÉQUENCEMENT (lockstep) — la base Supabase est PARTAGÉE prod/branches :
--    APPLIQUER CETTE MIGRATION **APRÈS** le déploiement Vercel du code repointé
--    (marketplace lit la vue supplier_product_moq_tiers_wholesaler_read ; products
--    déjà lu via vues redacted en prod). Séquence : (1) merge → main, (2) déploiement
--    Vercel terminé, (3) exécuter ce SQL dans Supabase → SQL Editor. Appliquer AVANT
--    le déploiement ferait disparaître le chip « paliers dispo » (embed vidé). Aucun
--    crash, mais régression d'affichage — donc lockstep.
-- =============================================================================

-- ── C1 : retirer l'accès grossiste à la table de base des paliers ────────────
DROP POLICY IF EXISTS "spmt: wholesaler read approved" ON public.supplier_product_moq_tiers;

-- Vue redacted grossiste : min_quantity SEULEMENT (aucun prix). Sert à savoir
-- qu'un produit approuvé a des paliers (chip « paliers dispo »), sans fuite USD.
CREATE OR REPLACE VIEW public.supplier_product_moq_tiers_wholesaler_read AS
SELECT t.supplier_product_id, t.min_quantity
FROM public.supplier_product_moq_tiers t
JOIN public.supplier_products sp ON sp.id = t.supplier_product_id
WHERE sp.approval_status = 'approved'
  AND sp.archived_at IS NULL
  AND (
    public.my_role() = 'wholesaler'
    OR (SELECT wholesale_access FROM public.profiles WHERE id = auth.uid()) = true
  );
REVOKE ALL  ON public.supplier_product_moq_tiers_wholesaler_read FROM anon, authenticated;
GRANT SELECT ON public.supplier_product_moq_tiers_wholesaler_read TO authenticated;
COMMENT ON VIEW public.supplier_product_moq_tiers_wholesaler_read IS
  'Vue redacted grossiste des paliers fournisseur : (supplier_product_id, min_quantity) '
  'UNIQUEMENT — aucun prix source USD. Remplace la policy base "spmt: wholesaler read '
  'approved" (mig 035) qui exposait unit_price_usd. Le prix affiché au grossiste reste '
  'le MAD indicatif calculé côté serveur (service_role, getIndicativeMadTiers), inchangé.';

-- ── C2 : retirer l'accès grossiste à la table de base des variantes ──────────
-- Aucune vue nécessaire : aucun écran client ne lit supplier_product_variants
-- (confirmé par cartographie ; seul un INSERT admin l'écrit).
DROP POLICY IF EXISTS "spv: wholesaler read approved" ON public.supplier_product_variants;

-- ── E2 : products SELECT base réservé au STAFF interne (reprise mig 091) ──────
-- Le code non-staff (grossiste/affilié/fournisseur/anon) lit déjà via
-- products_public_read / products_catalog_read / wholesale_catalog_read (vérifié).
-- Les calculs serveur (commission) passent par service_role (bypass RLS) — intacts.
DROP POLICY IF EXISTS "products: authenticated read active" ON public.products;
DROP POLICY IF EXISTS "products: staff read" ON public.products;
CREATE POLICY "products: staff read"
  ON public.products FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));
COMMENT ON POLICY "products: staff read" ON public.products IS
  'SELECT base réservé STAFF (admin/agent). Clients (grossiste/affilié/fournisseur) '
  'lisent via les vues redacted ; commission via service_role. Reprise mig 091 (dette 073).';
