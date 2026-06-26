-- Migration 104 — V5-bis.1 : socle stock fournisseur multi-modes + fraîcheur (ADDITIF PUR)
-- Contraintes figées Abdou (Option B disciplinée) :
--   • stock_mode (api/manuel/telegram/hebdo) + stock_quantity_updated_at au niveau PRODUIT.
--   • variant_id NULLABLE provisionné comme FK additive NON CÂBLÉE (futur lot Telegram/CSV par variante).
--   • ZÉRO touche RPC stock / commandes / paniers / finance. Aucune logique d'affichage ici.
-- Risque : NUL — colonnes nullables (stock_mode = DEFAULT non-volatile, ADD instantané en PG récent),
--   backfill identité, et CREATE OR REPLACE de la vue redacted 068 recopiée à l'identique + 2 colonnes
--   non sensibles ajoutées EN FIN (jamais un prix). La FK variant_id n'est exposée dans aucune vue.

-- ── Step 1 : colonnes additives sur supplier_products ────────────────────────

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'manuel',
  ADD COLUMN IF NOT EXISTS stock_quantity_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id);

-- CHECK sur stock_mode (drop-then-add idempotent, façon mig 053 pour `source`).
ALTER TABLE public.supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_stock_mode_check;
ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_stock_mode_check
  CHECK (stock_mode IN ('api', 'manuel', 'telegram', 'hebdo'));

-- Index sur la FK variante (non câblée, mais indexée pour le futur join).
CREATE INDEX IF NOT EXISTS idx_supplier_products_variant_id
  ON public.supplier_products (variant_id);

COMMENT ON COLUMN public.supplier_products.stock_mode IS
  'Mode de déclaration du stock fournisseur : api | manuel | telegram | hebdo. '
  'Défaut ''manuel'' pour l''existant (Telegram réécrit ''telegram'' à la prochaine ingestion).';
COMMENT ON COLUMN public.supplier_products.stock_quantity_updated_at IS
  'Horodatage DÉDIÉ de la dernière MAJ du stock (source de fraîcheur autoritaire). '
  'Distinct de updated_at (générique, rebumpé par toute édition). Alimenté en V5-bis.3.';
COMMENT ON COLUMN public.supplier_products.variant_id IS
  'FK additive NON CÂBLÉE vers product_variants(id) — provisionnée pour le futur lot '
  'déclaration de stock par variante (Telegram/CSV). Aucune logique ne la lit/écrit aujourd''hui.';

-- ── Step 2 : backfill identité de la fraîcheur pour l'existant ────────────────
-- L'existant récupère sa dernière date connue (updated_at) comme proxy de fraîcheur.

UPDATE public.supplier_products
SET stock_quantity_updated_at = updated_at
WHERE stock_quantity_updated_at IS NULL;

-- ── Step 3 : exposer stock_mode + stock_quantity_updated_at dans la vue redacted ──
-- Recopie EXACTE de la définition 068 (dernière en date ; 075/091 ne font que la référencer)
-- + 2 colonnes NON SENSIBLES ajoutées EN FIN. Expression de prix (ligne « suggested_wholesale_price_mad »)
-- INCHANGÉE. variant_id NON exposée. GRANT reproduit.

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
  ) AS is_verified,
  -- V5-bis.1 — champs de fraîcheur (non sensibles : ni prix, ni marge, ni PII).
  sp.stock_mode,
  sp.stock_quantity_updated_at
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
  'convertie, ni le taux de marge, ni le coût source ne sont exposés (anti-court-circuit). '
  'V5-bis.1 : expose en plus stock_mode + stock_quantity_updated_at (fraîcheur, non sensibles).';
