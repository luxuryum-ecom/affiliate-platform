-- 111 — Répare le double-encodage de products.wholesale_tiers (string → jsonb array)
--
-- CONTEXTE : certaines lignes LEGACY stockent `wholesale_tiers` comme un jsonb SCALAIRE
-- de type `string` (ex. la valeur jsonb est `"[{\"min_qty\":1,\"price_per_unit\":150}]"`,
-- une CHAÎNE JSON) au lieu d'un jsonb ARRAY `[{...}]`. Sur ces lignes, `jsonb_array_length`
-- plante (« cannot get array length of a scalar ») et l'affichage grossiste + les comptages
-- cassent. Le write-path ACTUEL est sain (products.ts JSON.parse → array ; buildMirrorTiers
-- → array) : c'est un résidu de données, pas un bug de code → fix ponctuel unique.
--
-- FIX : décoder la CHAÎNE en son ARRAY réel, en PRÉSERVANT les paliers existants (on convertit
-- le contenu, on ne le vide jamais). Idempotent : après passage les lignes sont de type 'array'
-- → ne re-matchent plus. Une chaîne NON décodable en array (donnée sale) est IGNORÉE ligne par
-- ligne (RAISE NOTICE) plutôt que d'avorter toute la migration : on répare le réparable, on ne
-- corrompt ni ne perd rien (durcissement suite finding @security-reviewer).
--
-- ⚠️ ARGENT : `wholesale_tiers` porte le prix grossiste RÉELLEMENT facturé (getWholesaleTier).
-- Cette migration ne change AUCUNE valeur de prix : elle corrige uniquement le TYPE d'encodage
-- (chaîne → tableau) du MÊME contenu. Revue @finance 🟢 + @security 🟢.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, (wholesale_tiers #>> '{}') AS raw_text
    FROM public.products
    WHERE jsonb_typeof(wholesale_tiers) = 'string'
  LOOP
    BEGIN
      -- Ne convertir que si le décodage donne bien un ARRAY (jamais de MAD/paliers fabriqués).
      IF jsonb_typeof(r.raw_text::jsonb) = 'array' THEN
        UPDATE public.products
        SET wholesale_tiers = r.raw_text::jsonb
        WHERE id = r.id;
      END IF;
    EXCEPTION WHEN others THEN
      -- Chaîne non décodable (donnée sale) : on laisse la ligne intacte, on trace, on continue.
      RAISE NOTICE 'wholesale_tiers non décodable (ligne ignorée) : %', r.id;
    END;
  END LOOP;
END $$;
