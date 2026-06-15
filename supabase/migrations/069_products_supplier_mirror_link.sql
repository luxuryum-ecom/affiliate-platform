-- Migration 069 — Lien miroir catalogue ↔ supplier_product (auto-provision idempotent)
-- ADDITIF UNIQUEMENT : aucune colonne supprimée, aucune donnée réécrite, aucun trigger modifié.
--
-- But : autoriser la COMMANDE DIRECTE des produits fournisseurs Maroc `local_stock` en
-- auto-provisionnant un produit catalogue (`products`) MIROIR à l'approbation du supplier_product.
-- Le miroir porte le prix réellement facturé (cf. checkout) :
--   products.sell_price       = supplier_products.final_wholesale_price_mad   (prix vitrine grossiste)
--   products.factory_cost_mad = supplier_products.suggested_wholesale_price_mad (coût fournisseur AVANT marge)
-- Marge plateforme captée UNE fois = sell_price − factory_cost_mad (= final − suggested).
--
-- La colonne de lien + l'index UNIQUE PARTIEL garantissent l'idempotence : un seul miroir par
-- supplier_product, UPSERT onConflict (ré-approuver = mise à jour du même miroir, jamais de doublon).
-- Les produits catalogue MANUELS conservent source_supplier_product_id = NULL (hors index partiel).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_supplier_product_id uuid
    REFERENCES public.supplier_products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.source_supplier_product_id IS
  'Non-NULL = produit catalogue MIROIR auto-provisionné depuis le supplier_product référencé '
  '(marketplace Maroc local_stock). sell_price = final_wholesale_price_mad, '
  'factory_cost_mad = suggested_wholesale_price_mad. NULL = produit catalogue manuel. '
  'Voir src/lib/supplier-mirror.ts + src/app/actions/supplier-products.ts (approveSupplierProduct).';

-- Idempotence : au plus un miroir actif par supplier_product. Index PARTIEL → les produits
-- manuels (NULL) ne sont pas contraints et ne collisionnent jamais entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS products_source_supplier_product_id_uidx
  ON public.products (source_supplier_product_id)
  WHERE source_supplier_product_id IS NOT NULL;
