-- Migration 068 — Marge plateforme fournisseur (canal DIRECT) : application au prix
--
-- Contexte : `supplier_products.platform_margin_value`/`_type` existaient (migr. 030)
-- mais étaient ORPHELINS — jamais appliqués à un prix. Ce chantier les branche enfin,
-- via un INTERRUPTEUR par produit et un prix FINAL calculé CÔTÉ SERVEUR (TS), jamais
-- visible au grossiste (il ne voit qu'un seul nombre = le prix final).
--
-- Design (validé Abdou + @architect + @finance) :
--   1. `apply_platform_margin boolean DEFAULT false` — toggle par produit. OFF par
--      défaut → AUCUNE bascule de prix rétroactive sur l'existant.
--   2. `final_wholesale_price_mad numeric(10,2)` — prix marketplace final = base +
--      marge (si toggle ON), calculé en TS (`applyPlatformMargin`, miroir half-up de
--      `calculatePlatformPrice`) à l'approbation. Backfill = identité (= suggested).
--   3. La vue acheteur expose `COALESCE(final, suggested)` SOUS le nom existant
--      `suggested_wholesale_price_mad` → le grossiste voit le prix final, la base
--      brute et le taux de marge ne fuient jamais (anti-court-circuit préservé).
--
-- NB : la vue supplier_products_wholesaler_read n'est définie qu'en migration 045
-- (jamais modifiée depuis ; 060/063/064 touchent les vues wholesale_orders). Ce
-- CREATE OR REPLACE reproduit fidèlement 045 + la seule expression de prix changée.
--
-- ADD-ONLY, idempotente. Aucune donnée existante modifiée (backfill = identité stricte).

-- ── 1. Toggle + colonne prix final ───────────────────────────────────────────
ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS apply_platform_margin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_wholesale_price_mad numeric(10,2);

COMMENT ON COLUMN public.supplier_products.apply_platform_margin IS
  'Interrupteur par produit : si true, la marge plateforme Mozouna (platform_margin_*) '
  'est ajoutée au prix converti pour donner final_wholesale_price_mad. Calcul serveur. '
  'OFF par défaut (le fournisseur peut avoir déjà inclus sa marge).';
COMMENT ON COLUMN public.supplier_products.final_wholesale_price_mad IS
  'Prix marketplace FINAL en MAD (marge incluse si apply_platform_margin). Calculé en '
  'TS (applyPlatformMargin) à l''approbation. Exposé au grossiste via la vue redacted ; '
  'jamais la base (suggested) ni le taux de marge.';

-- ── 2. Backfill = identité (toggle OFF partout → final = suggested) ───────────
-- Aucune bascule de prix : le grossiste voit exactement le même prix qu''avant.
UPDATE public.supplier_products
SET final_wholesale_price_mad = suggested_wholesale_price_mad
WHERE final_wholesale_price_mad IS NULL;

-- ── 3. Vue acheteur : exposer le prix FINAL sous le nom existant ──────────────
-- CREATE OR REPLACE conserve le nom/ordre des colonnes (seule l''expression de la
-- colonne prix change : COALESCE(final, suggested)). Aucune autre colonne ajoutée
-- → le code acheteur (SELECT 'suggested_wholesale_price_mad') est inchangé et reçoit
-- désormais le prix final. La base brute n''est PAS exposée séparément.
CREATE OR REPLACE VIEW public.supplier_products_wholesaler_read AS
SELECT
  sp.id,
  sp.product_name,
  sp.category,
  sp.subcategory,
  sp.niche,
  sp.description,
  sp.photos,
  sp.min_quantity,
  sp.origin_country,
  sp.availability_type,
  sp.target_buyer_type,
  COALESCE(sp.final_wholesale_price_mad, sp.suggested_wholesale_price_mad) AS suggested_wholesale_price_mad,
  sp.public_name,
  sp.public_description,
  sp.approval_status,
  sp.supplier_type,
  sp.unit,
  sp.stock_quantity,
  sp.lead_time_days,
  sp.export_countries,
  sp.created_at,
  sp.updated_at,
  sp.archived_at,
  COALESCE(
    (
      SELECT pp.featured_badge
      FROM public.supplier_subscriptions ss
      JOIN public.premium_plans pp ON pp.id = ss.plan_id
      WHERE ss.supplier_id = sp.supplier_id
        AND ss.status = 'active'
      LIMIT 1
    ),
    false
  ) AS is_featured,
  COALESCE(
    (
      SELECT pp.verified_badge
      FROM public.supplier_subscriptions ss
      JOIN public.premium_plans pp ON pp.id = ss.plan_id
      WHERE ss.supplier_id = sp.supplier_id
        AND ss.status = 'active'
      LIMIT 1
    ),
    false
  ) AS is_verified
FROM public.supplier_products sp
WHERE sp.approval_status = 'approved'
  AND sp.archived_at IS NULL
  AND (
    public.my_role() = 'wholesaler'
    OR (
      SELECT wholesale_access
      FROM public.profiles
      WHERE id = auth.uid()
    ) = true
  );

GRANT SELECT ON public.supplier_products_wholesaler_read TO authenticated;

COMMENT ON VIEW public.supplier_products_wholesaler_read IS
  'Vue redacted grossiste des produits fournisseurs approuvés. Le prix exposé est le '
  'prix FINAL (marge plateforme incluse via final_wholesale_price_mad) ; ni la base '
  'convertie, ni le taux de marge, ni le coût source ne sont exposés (anti-court-circuit).';
