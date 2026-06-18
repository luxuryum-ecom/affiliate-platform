-- =============================================================================
-- Migration 079 — products.sale_unit : unité de VENTE (affichage)   (LOT P1)
-- =============================================================================
-- ADDITIF PUR. Ajoute l'unité de vente (mètre/kg/paquet/pièce/carton) sur le
-- catalogue `products`. AUCUN calcul ne dépend de cette colonne : prix, capital,
-- commission, paliers et checkout sont inchangés. C'est de l'AFFICHAGE.
--
-- NON-RÉGRESSION (prouvée) :
--   • Colonne NULLABLE, SANS DEFAULT, SANS backfill → aucune ligne existante n'est
--     réécrite, aucun verrou de rewrite, aucune valeur introduite. NULL = « pièce »
--     implicite, résolu UNIQUEMENT à l'affichage par le helper resolveUnitLabel.
--   • Un produit existant (sale_unit NULL) s'affiche EXACTEMENT comme avant
--     (le suffixe d'unité n'est ajouté QUE si sale_unit IS NOT NULL).
--
-- NE PAS CONFONDRE avec `import_price_unit` (kg/cbm) qui est l'unité du COÛT
-- TRANSPORT import (migration 020), un concept totalement distinct. D'où le nom
-- dédié `sale_unit`.
--
-- Type `text` libre (pas d'enum Postgres strict) : la validation/normalisation se
-- fait côté application (lib/units.ts). Valeurs cible : 'piece','metre','kg',
-- 'paquet','carton' ; toute autre valeur → traitée comme « pièce » à l'affichage.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_unit text;

COMMENT ON COLUMN public.products.sale_unit IS
  'Unité de VENTE pour affichage (mètre/kg/paquet/pièce/carton). NULL = pièce '
  'implicite. AUCUN calcul n''en dépend (prix/capital/commission/paliers/checkout '
  'inchangés). Distinct de import_price_unit (coût transport import). '
  'Normalisé côté app (src/lib/units.ts).';
