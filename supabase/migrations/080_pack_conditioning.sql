-- =============================================================================
-- Migration 080 — conditionnement DESCRIPTIF (pack_size / pack_unit)   (LOT P3)
-- =============================================================================
-- ADDITIF PUR. Ajoute le conditionnement (ex. « carton de 50 boîtes ») sur
-- `products` ET `supplier_products`. 100 % DESCRIPTIF / AFFICHAGE :
--   • pack_size  = nombre d'unités de conditionnement par unité de vente (ex. 50)
--   • pack_unit  = nom de l'unité de conditionnement (ex. « boîte »)
--
-- ON FACTURE TOUJOURS À L'UNITÉ DE VENTE (le carton). Le « prix / boîte » affiché
-- est DÉRIVÉ (prix ÷ pack_size) UNIQUEMENT à l'affichage — jamais stocké, jamais
-- facturé. AUCUN calcul (prix/capital/commission/paliers/checkout) ne lit ces
-- colonnes (vérifié : grep pack_size/pack_unit = ∅ dans utils/savings/cart/orders).
--
-- NON-RÉGRESSION : colonnes NULLABLE, SANS default, SANS backfill → aucune ligne
-- réécrite, aucun verrou. NULL = pas de conditionnement → affichage strictement
-- identique à aujourd'hui.
--
-- ⚠️ FACTURER À LA BOÎTE un jour = CHANGEMENT DE CALCUL → circuit @finance. Ce
-- n'est PAS le cas ici (descriptif only).
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS pack_unit text;

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS pack_unit text;

COMMENT ON COLUMN public.products.pack_size IS
  'Conditionnement DESCRIPTIF : nb d''unités de cond. par unité de vente (ex. 50). '
  'NULL = aucun. Affichage seul — prix/boîte DÉRIVÉ (prix÷pack_size), jamais facturé.';
COMMENT ON COLUMN public.products.pack_unit IS
  'Conditionnement DESCRIPTIF : nom de l''unité de cond. (ex. « boîte »). NULL = aucun.';
COMMENT ON COLUMN public.supplier_products.pack_size IS
  'Idem products.pack_size (rempli par l''extraction IA Telegram). Descriptif seul.';
COMMENT ON COLUMN public.supplier_products.pack_unit IS
  'Idem products.pack_unit (rempli par l''extraction IA Telegram). Descriptif seul.';
