-- =============================================================================
-- Migration 096 — VARIANTES PRODUIT (Étape 1 du grand chantier "stock par variante")
-- =============================================================================
-- Réf : docs/ROADMAP_MASTER.md (Étape 1) + docs/ARCHI_VARIANTES_STOCK.md.
--
-- PÉRIMÈTRE STRICT — ADDITIF PUR, ZÉRO FINANCE, ZÉRO RISQUE :
--   • Crée la table `product_variants` (attributs FLEXIBLES jsonb, pas de colonnes
--     taille/couleur en dur). Produit simple = 1 variante "défaut".
--   • RÉTRO-REMPLISSAGE : chaque produit EXISTANT reçoit AUTOMATIQUEMENT une variante
--     défaut (is_default=true) qui COPIE son stock_count actuel.
--   • DOUBLE-ÉCRITURE : on COPIE le stock dans la variante, on NE TOUCHE PAS
--     `products.stock_count` (les deux coexistent jusqu'à la bascule finale, Étape 7).
--   • RLS deny par défaut : lecture alignée sur products (staff interne) + manage_stock ;
--     écriture admin/manage_stock.
--
-- CE QUE CETTE MIGRATION NE TOUCHE PAS (sera fait aux étapes suivantes) :
--   • stock_movements / reserve_stock / restore_stock / adjust_stock_manual (Étape 4)
--   • orders / wholesale_order_items / panier (Étape 6)
--   • affichage / vues clients redacted (Étape 3)
--   • finance (prix/commission/marge/paliers) — JAMAIS touchée par les variantes
--
-- IDEMPOTENTE : CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS, INSERT ... WHERE NOT EXISTS.
-- Aucune donnée détruite. Aucun stock modifié sur products.
--
-- POINT @finance : aucune colonne financière. `stock_count` de la variante est une
--   quantité de stock (entier), pas un montant. Zéro impact prix/commission/ledger.
-- POINT @security : RLS ENABLE + deny par défaut ; lecture staff/manage_stock ;
--   écriture admin/manage_stock ; pas de fuite vers les rôles clients (vues = Étape 3).
-- =============================================================================

-- ── 1. Table product_variants ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_variants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Attributs FLEXIBLES : paires axe→valeur, ex {"taille":"T1","couleur":"rouge"}.
  -- {} pour la variante défaut d'un produit simple (aucun axe distinctif).
  attributes  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sku         text,                                   -- optionnel (référence interne)
  is_default  boolean     NOT NULL DEFAULT false,     -- variante par défaut du produit
  -- COPIE du stock (double-écriture). PAS de CHECK >= 0 : cohérent avec Option A
  -- (le CHECK products.stock_count >= 0 a été retiré en mig 093 — l'oversell est permis).
  stock_count integer     NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_variants IS
  'Variantes produit à attributs flexibles (WMS / chantier variantes, mig 096, Étape 1). '
  'Le stock est porté par la variante (attributes jsonb = axes flexibles). '
  'Produit simple = 1 variante is_default avec attributes={}. '
  'stock_count = COPIE du stock produit (double-écriture ; products.stock_count inchangé '
  'jusqu''à la bascule finale Étape 7). Aucune donnée financière.';

-- ── 2. Index & contraintes d'intégrité ───────────────────────────────────────

-- Une SEULE variante défaut par produit (garantit : aucun produit sans/avec 2 défauts).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_variants_one_default
  ON public.product_variants (product_id)
  WHERE is_default;

-- SKU unique quand renseigné (optionnel ; aucun SKU à ce stade).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_variants_sku
  ON public.product_variants (sku)
  WHERE sku IS NOT NULL;

-- Accès par produit (lecture des variantes d'un produit).
CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants (product_id);

-- ── 3. Trigger updated_at ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.product_variants_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.product_variants_set_updated_at();

-- ── 4. RLS — deny par défaut ─────────────────────────────────────────────────
-- Lecture : STAFF INTERNE (admin/agent, comme products base-table mig 091) OU manage_stock.
--   Les rôles CLIENTS (affilié/grossiste/fournisseur/public) liront via des vues redacted
--   à l'Étape 3 (affichage) — comme products_catalog_read / products_public_read.
-- Écriture : admin OU manage_stock.

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_variants: staff or manage_stock read" ON public.product_variants;
CREATE POLICY "product_variants: staff or manage_stock read"
  ON public.product_variants
  FOR SELECT TO authenticated
  USING (
    public.my_role() IN ('admin', 'agent')
    OR public.has_capability('manage_stock')
  );

DROP POLICY IF EXISTS "product_variants: admin or manage_stock insert" ON public.product_variants;
CREATE POLICY "product_variants: admin or manage_stock insert"
  ON public.product_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );

DROP POLICY IF EXISTS "product_variants: admin or manage_stock update" ON public.product_variants;
CREATE POLICY "product_variants: admin or manage_stock update"
  ON public.product_variants
  FOR UPDATE TO authenticated
  USING (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  )
  WITH CHECK (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );

DROP POLICY IF EXISTS "product_variants: admin or manage_stock delete" ON public.product_variants;
CREATE POLICY "product_variants: admin or manage_stock delete"
  ON public.product_variants
  FOR DELETE TO authenticated
  USING (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );

-- ── 5. RÉTRO-REMPLISSAGE — 1 variante défaut par produit existant ─────────────
-- COPIE le stock_count actuel du produit (double-écriture). N'écrase RIEN.
-- Idempotent : ne crée une défaut que pour les produits qui n'en ont pas déjà une.
-- S'exécute en tant qu'owner de migration (bypass RLS) → indépendant des policies.

INSERT INTO public.product_variants (product_id, attributes, sku, is_default, stock_count, active)
SELECT
  p.id,
  '{}'::jsonb,
  NULL,
  true,
  p.stock_count,            -- COPIE exacte (peut être négatif si oversell — conservé tel quel)
  COALESCE(p.active, true)
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_variants v
  WHERE v.product_id = p.id AND v.is_default
);
