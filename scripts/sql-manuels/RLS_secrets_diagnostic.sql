-- =============================================================================
-- DIAGNOSTIC RLS — Fuites de secrets financiers (coût / marge / prix source)
-- LECTURE SEULE — n'écrit RIEN, ne modifie AUCUNE policy. Sans danger.
-- À lancer par Abdou dans Supabase → SQL Editor (prod), résultats à me remettre.
-- Objectif : connaître l'état RÉEL des policies en prod AVANT le correctif RLS.
-- =============================================================================

-- ── 1. products : la migration 091 est-elle appliquée ? (finding E2) ──────────
-- Attendu SAIN  : une policy "products: staff read" (admin/agent seulement).
-- ❌ PROBLÈME    : si "products: authenticated read active" existe encore
--                  → coût d'usine + marge lisibles par tout utilisateur connecté.
SELECT '1. products SELECT' AS bloc, policyname, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products' AND cmd = 'SELECT'
ORDER BY policyname;

-- ── 2. wholesale_orders : l'acheteur lit-il encore la table de base ? (E1) ────
-- ❌ PROBLÈME si une policy SELECT contient "buyer_id = auth.uid()"
--    → le grossiste peut lire gross_profit_mad / gross_margin_percent en direct.
SELECT '2. wholesale_orders SELECT' AS bloc, policyname, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'wholesale_orders' AND cmd = 'SELECT'
ORDER BY policyname;

-- ── 3. supplier_product_moq_tiers : accès grossiste à unit_price_usd ? (C1) ───
-- ❌ PROBLÈME si une policy "wholesaler read" existe (SELECT sur table de base)
--    → prix source USD du fournisseur lisible par le grossiste.
SELECT '3. supplier_product_moq_tiers ALL' AS bloc, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'supplier_product_moq_tiers'
ORDER BY policyname;

-- ── 4. supplier_product_variants : accès grossiste à price_adjustment_usd ? (C2)
SELECT '4. supplier_product_variants ALL' AS bloc, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'supplier_product_variants'
ORDER BY policyname;

-- ── 5. supplier_products : le fournisseur lit-il la marge sur sa fiche ? (M1) ─
SELECT '5. supplier_products SELECT' AS bloc, policyname, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'supplier_products' AND cmd = 'SELECT'
ORDER BY policyname;

-- ── 6. Vues redacted présentes en prod ? (socle du correctif) ─────────────────
SELECT '6. vues redacted' AS bloc, table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
    'supplier_products_wholesaler_read',
    'wholesale_orders_buyer_read',
    'products_public_read',
    'products_catalog_read',
    'wholesale_catalog_read',
    'product_variants_read'
  )
ORDER BY table_name;
