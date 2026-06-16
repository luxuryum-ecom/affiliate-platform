-- Migration 074 — Pré-confirmation commande (Option A) + plancher packaging 10 MAD
--
-- OPTION A (décision Abdou, 2026-06-16) :
--   is_pre_confirmed = true  → le vendeur a déjà confirmé la commande côté terrain.
--   La PLATEFORME garde les 10 MAD de frais de confirmation (coût non engagé).
--   La COMMISSION AFFILIÉ est INCHANGÉE : confirmation_fee_snapshot reste ?? 10.
--   Le flag est PUREMENT informatif (traçabilité) — il ne modifie aucun montant.
--
-- DEFAULT false sur toutes les commandes existantes = confirmation facturée → cohérent.
--
-- PACKAGING MIN 10 MAD (D2) :
--   Recalibre les produits affiliés locaux dont packaging_fee_mad < 10 vers 10 MAD.
--   Recalcule sell_price par composants (jamais ancien_prix + delta).
--
-- NON-RÉTROACTIF : aucune écriture sur orders ou commissions existantes.
-- Le sell_price recalculé ci-dessous ne touche que les 2 produits avec packaging < 10.

-- ── 1. DDL (hors transaction — ADD COLUMN ne peut pas être dans un BEGIN/COMMIT) ───────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_pre_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.is_pre_confirmed IS
  'True si la commande a été pré-confirmée par le vendeur terrain. '
  'Option A : la plateforme garde les 10 MAD de confirmation (coût non engagé). '
  'La commission affilié NE CHANGE PAS — confirmation_fee_snapshot reste ?? 10. '
  'Ce flag est purement tracé ; il ne modifie aucun calcul financier.';

-- ── 2. DML dans une transaction ──────────────────────────────────────────────────────────

BEGIN;

-- 2.a Audit : enregistre uniquement les produits dont sell_price va changer
INSERT INTO products_sell_price_audit (product_id, old_sell_price, new_sell_price, reason)
SELECT
  p.id,
  p.sell_price,
  -- Recalcul par composants avec packaging = 10
  -- ⚠️ Le « + 35 » ci-dessous = DELIVERY_PROVISION_MAD (src/lib/utils.ts).
  -- Si cette constante change côté code, mettre à jour ce nombre ici aussi.
  ROUND(
    CASE
      WHEN p.platform_margin_type = 'percentage'
        THEN p.factory_cost_mad * (1 + p.platform_margin_value / 100)
      ELSE
        p.factory_cost_mad + p.platform_margin_value
    END
  ) + 10 + p.confirmation_fee_mad + 35,
  'migration_074_packaging_fix'
FROM products p
WHERE
  p.affiliate_enabled = true
  AND p.availability_type = 'local_stock'
  AND p.source_supplier_product_id IS NULL
  AND p.packaging_fee_mad < 10
  AND p.factory_cost_mad IS NOT NULL
  -- Idempotence : n'auditer que si la valeur va réellement changer
  AND p.sell_price IS DISTINCT FROM (
    ROUND(
      CASE
        WHEN p.platform_margin_type = 'percentage'
          THEN p.factory_cost_mad * (1 + p.platform_margin_value / 100)
        ELSE
          p.factory_cost_mad + p.platform_margin_value
      END
    ) + 10 + p.confirmation_fee_mad + 35
  );

-- 2.b Mise à jour : packaging → 10 + recalcul sell_price par composants
-- ⚠️ Le « + 35 » ci-dessous = DELIVERY_PROVISION_MAD (src/lib/utils.ts).
-- Si cette constante change côté code, mettre à jour ce nombre ici aussi.
UPDATE products
SET
  packaging_fee_mad = 10,
  sell_price =
    ROUND(
      CASE
        WHEN platform_margin_type = 'percentage'
          THEN factory_cost_mad * (1 + platform_margin_value / 100)
        ELSE
          factory_cost_mad + platform_margin_value
      END
    ) + 10 + confirmation_fee_mad + 35
WHERE
  affiliate_enabled = true
  AND availability_type = 'local_stock'
  AND source_supplier_product_id IS NULL
  AND packaging_fee_mad < 10
  AND factory_cost_mad IS NOT NULL;

COMMIT;
