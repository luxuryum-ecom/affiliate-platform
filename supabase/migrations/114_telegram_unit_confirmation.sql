-- =============================================================================
-- Migration 114 — Confirmation conversationnelle de l'UNITÉ DE VENTE   (LOT C1a)
-- =============================================================================
-- Étend l'état conversationnel du bot fournisseur (telegram_pending_products, mig
-- 113) pour une nouvelle étape : après le prix, le bot CONFIRME l'unité de vente
-- détectée par l'IA (« tu vends au gramme, c'est bien ça ? ») → le fournisseur
-- valide ou corrige (texte LIBRE : gramme, litre, botte, sachet…).
--
-- Deux changements, tous deux ADDITIFS et rétro-compatibles :
--   1) `awaiting` accepte désormais 'unit' (en plus de 'price' / 'tiers') ;
--   2) nouvelle colonne `proposed_unit` (texte libre, nullable) qui porte l'unité
--      détectée pendant l'aller-retour de confirmation.
--
-- AUCUNE colonne produit ajoutée : `products.sale_unit` (mig 079, texte libre) et
-- `supplier_products.unit` (mig 035) existent DÉJÀ — on ne les reconstruit pas.
-- RLS inchangée : la table reste service_role uniquement (worker bot). Aucune
-- policy à ajouter (RLS au niveau ligne, pas colonne). Affichage = pur, aucun
-- impact prix/paliers/commission (audit @finance).
-- =============================================================================

-- 1) Élargir la contrainte CHECK de `awaiting` pour inclure 'unit'.
--    La contrainte de la mig 113 est inline (auto-nommée par Postgres).
ALTER TABLE public.telegram_pending_products
  DROP CONSTRAINT IF EXISTS telegram_pending_products_awaiting_check;

ALTER TABLE public.telegram_pending_products
  ADD CONSTRAINT telegram_pending_products_awaiting_check
  CHECK (awaiting IN ('price', 'tiers', 'unit'));

-- 2) Colonne portant l'unité détectée (texte libre) pendant la confirmation.
--    NULL par défaut → les lignes existantes restent valides, comportement inchangé.
ALTER TABLE public.telegram_pending_products
  ADD COLUMN IF NOT EXISTS proposed_unit text;

COMMENT ON COLUMN public.telegram_pending_products.proposed_unit IS
  'Unité de vente détectée par l''IA (texte libre), portée pendant l''étape de '
  'confirmation (awaiting=''unit''). Le fournisseur la valide ou la corrige. '
  'AFFICHAGE PUR — n''affecte aucun calcul de prix/palier/commission (LOT C1a).';
