-- 112 — Toggle par produit : génération auto de paliers dégressifs (ADDITIF)
--
-- Contexte : à l'approbation d'un produit fournisseur SANS paliers source, le système
-- peut générer automatiquement 4 tranches dégressives (décote basée sur la marge, plancher
-- dur) — cf. `generateAutoTiers` (supplier-pricing.ts). Ce toggle permet de désactiver la
-- génération par produit depuis la modération admin.
--
-- ON par défaut (true) : cohérent avec « auto ON par défaut ». Un produit qui a DÉJÀ des
-- paliers source n'est PAS concerné (ses paliers priment ; l'auto ne se déclenche que sur
-- paliers vides). ZÉRO impact sur les produits existants (colonne additive, défaut true =
-- comportement d'affichage inchangé tant qu'aucune ré-approbation n'a lieu).

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS auto_tiers_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.supplier_products.auto_tiers_enabled IS
  'Toggle génération auto de paliers dégressifs à l''approbation (uniquement si aucun palier '
  'source). ON par défaut. Décote basée marge + plancher dur (generateAutoTiers). Désactivable '
  'en modération admin. N''affecte JAMAIS un produit avec paliers source.';
