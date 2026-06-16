-- Migration 073 — Règle capital affilié : prix catalogue = coût usine + marge + packaging + confirmation + 35 MAD
--
-- Cette migration recalibre les prix de vente des produits affiliés locaux existants
-- pour les aligner sur la règle capital définie côté serveur (products.ts upsertProduct).
--
-- PÉRIMÈTRE : produits WHERE affiliate_enabled = true AND availability_type = 'local_stock'
--   AND source_supplier_product_id IS NULL (saisis manuellement, pas des miroirs fournisseur)
--   AND factory_cost_mad IS NOT NULL (coût usine renseigné — pré-requis de la règle)
--
-- NON-RÉTROACTIF : les snapshots de commissions dans la table `orders` sont immuables.
-- Seuls les nouveaux prix catalogue sont mis à jour ; les commandes passées ne sont pas retouchées.
--
-- FORMULE (doit rester BIT-IDENTIQUE à calculatePlatformPrice en JS) :
--   platform_price = ROUND(usine × (1 + pct/100))  si percentage
--                  = ROUND(usine + valeur_fixe)     si fixed
--   nouveau_prix   = platform_price + packaging_fee_mad + confirmation_fee_mad + 35
--   (ROUND sur la partie plateforme uniquement, comme en JS ; pas de re-arrondi sur les frais)
--
-- ⚠️ TRAÇABILITÉ — le « + 35 » ci-dessous = DELIVERY_PROVISION_MAD (src/lib/utils.ts),
-- provision livraison fixe incluse dans le capital. Le SQL ne peut pas importer la
-- constante TS : si cette valeur change côté code, METTRE À JOUR ce nombre ici aussi.
--
-- IDEMPOTENT : l'INSERT audit filtre les lignes old = new (AND sell_price IS DISTINCT FROM new).
-- L'UPDATE recalcule toujours la même valeur → rejouer est sans effet sur les données.

-- ── Table d'audit ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products_sell_price_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL,
  old_sell_price numeric(10,2),
  new_sell_price numeric(10,2),
  reason       text,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products_sell_price_audit ENABLE ROW LEVEL SECURITY;
-- Aucune policy : deny par défaut. Accessible uniquement via service_role (audit interne).

-- ── Recalibrage dans une transaction ─────────────────────────────────────────

BEGIN;

-- 1. Audit : enregistre uniquement les lignes où le prix va CHANGER (anti-spam replay)
INSERT INTO products_sell_price_audit (product_id, old_sell_price, new_sell_price, reason)
SELECT
  p.id,
  p.sell_price,
  ROUND(
    CASE
      WHEN p.platform_margin_type = 'percentage'
        THEN p.factory_cost_mad * (1 + p.platform_margin_value / 100)
      ELSE
        p.factory_cost_mad + p.platform_margin_value
    END
  ) + p.packaging_fee_mad + p.confirmation_fee_mad + 35,
  'migration_073_capital_rule'
FROM products p
WHERE
  p.affiliate_enabled = true
  AND p.availability_type = 'local_stock'
  AND p.source_supplier_product_id IS NULL
  AND p.factory_cost_mad IS NOT NULL
  -- Filtre : ne loguer que si la valeur va réellement changer
  AND p.sell_price IS DISTINCT FROM (
    ROUND(
      CASE
        WHEN p.platform_margin_type = 'percentage'
          THEN p.factory_cost_mad * (1 + p.platform_margin_value / 100)
        ELSE
          p.factory_cost_mad + p.platform_margin_value
      END
    ) + p.packaging_fee_mad + p.confirmation_fee_mad + 35
  );

-- 2. Mise à jour des prix catalogue vers la valeur capital
UPDATE products
SET sell_price =
  ROUND(
    CASE
      WHEN platform_margin_type = 'percentage'
        THEN factory_cost_mad * (1 + platform_margin_value / 100)
      ELSE
        factory_cost_mad + platform_margin_value
    END
  ) + packaging_fee_mad + confirmation_fee_mad + 35
WHERE
  affiliate_enabled = true
  AND availability_type = 'local_stock'
  AND source_supplier_product_id IS NULL
  AND factory_cost_mad IS NOT NULL;

COMMIT;
