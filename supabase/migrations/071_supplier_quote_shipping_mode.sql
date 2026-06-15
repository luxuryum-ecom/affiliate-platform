-- Migration 071 — Mode d'expédition souhaité sur les demandes de devis marketplace.
-- ADDITIF STRICT : colonne nullable ajoutée. Aucune donnée modifiée, aucune contrainte
-- destructive, aucun autre objet touché.
--
-- But : pour un produit IMPORTÉ, le grossiste précise dans sa demande de devis le mode
-- d'expédition souhaité (aérien / maritime). L'admin s'en sert pour chiffrer transport +
-- douane dans le devis renvoyé. Valeurs attendues (validées côté serveur, cf.
-- src/app/actions/supplier-products.ts requestSupplierProductQuote) :
--   air_door_to_door_kg | sea_textile_kg | sea_volume_cbm   (NULL = à déterminer)
-- Pas de CHECK contraignant ici : validation applicative par allowlist (évite de rejeter
-- d'éventuelles valeurs héritées et garde la migration purement additive).

ALTER TABLE public.supplier_quote_requests
  ADD COLUMN IF NOT EXISTS preferred_shipping_mode text;

COMMENT ON COLUMN public.supplier_quote_requests.preferred_shipping_mode IS
  'Mode d''expédition souhaité (import) : air_door_to_door_kg | sea_textile_kg | sea_volume_cbm. NULL = à déterminer.';
