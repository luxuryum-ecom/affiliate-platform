-- ============================================================================
-- A2 — RÉPARATION (IDEMPOTENTE) : bornage max_qty des paliers catalogue existants
-- ----------------------------------------------------------------------------
-- À LANCER PAR ABDOU dans Supabase → SQL Editor (PROD), APRÈS le diagnostic + GO.
-- ⛔ NE PAS faire `supabase db push` (ce n'est pas une migration).
-- ⚠️ ARGENT : wholesale_tiers porte le prix grossiste RÉELLEMENT facturé.
--
-- LOGIQUE = celle du fix serveur (boundWholesaleTierMaxQty) = celle de buildMirrorTiers :
--   pour chaque palier trié par min_qty croissant → max_qty = (min_qty du suivant − 1) ;
--   DERNIER palier = ouvert (max_qty RETIRÉ). min_qty et price_per_unit JAMAIS touchés.
--
-- IDEMPOTENT : ne réécrit une ligne que si le résultat DIFFÈRE de l'existant
-- (garde `IS DISTINCT FROM`). Un 2e passage ne change plus rien. Décode aussi le
-- double-encodage (string → array) au passage, uniquement sur les lignes réécrites.
--
-- CONSEIL : lancer d'abord le SELECT d'aperçu (bloc PREVIEW en bas) pour voir
-- avant/après, puis exécuter l'UPDATE.
-- ============================================================================

WITH normalized AS MATERIALIZED (
  SELECT
    p.id,
    CASE
      WHEN jsonb_typeof(p.wholesale_tiers) = 'array' THEN p.wholesale_tiers
      WHEN jsonb_typeof(p.wholesale_tiers) = 'string'
           AND jsonb_typeof((p.wholesale_tiers #>> '{}')::jsonb) = 'array'
        THEN (p.wholesale_tiers #>> '{}')::jsonb
      ELSE NULL
    END AS tiers_arr
  FROM public.products p
  WHERE p.wholesale_tiers IS NOT NULL
),
multi AS MATERIALIZED (
  SELECT id, tiers_arr
  FROM normalized
  WHERE tiers_arr IS NOT NULL
    AND jsonb_typeof(tiers_arr) = 'array'
    AND jsonb_array_length(tiers_arr) >= 2
),
exploded AS MATERIALIZED (
  SELECT
    m.id,
    (elem ->> 'min_qty')::int             AS min_qty,
    (elem ->> 'price_per_unit')::numeric  AS price_per_unit,
    lead((elem ->> 'min_qty')::int) OVER w AS next_min_qty
  FROM multi m,
       LATERAL jsonb_array_elements(m.tiers_arr) AS elem
  WINDOW w AS (PARTITION BY m.id ORDER BY (elem ->> 'min_qty')::int ASC)
),
-- GARDE-FOU (durcissement @finance) : le SQL, contrairement au serveur (products.ts:482-490),
-- ne re-valide pas les paliers. On EXCLUT de la réparation tout produit dont les paliers sont
-- MALFORMÉS (données legacy) pour ne JAMAIS écrire une ligne corrompue :
--   - min_qty ou price_per_unit absent/nul/invalide, ou prix ≤ 0 ;
--   - min_qty en DOUBLON (lead() non déterministe → tranche vide max < min).
-- Ces produits restent INTACTS (à corriger à la main via le formulaire admin, qui re-valide).
valid_ids AS MATERIALIZED (
  SELECT id
  FROM exploded
  GROUP BY id
  HAVING count(*) FILTER (
           WHERE min_qty IS NULL OR price_per_unit IS NULL OR price_per_unit <= 0
         ) = 0
     AND count(DISTINCT min_qty) = count(*)   -- aucun doublon de min_qty
),
rebuilt AS MATERIALIZED (
  SELECT
    id,
    jsonb_agg(
      CASE
        WHEN next_min_qty IS NOT NULL
          THEN jsonb_build_object('min_qty', min_qty, 'max_qty', next_min_qty - 1, 'price_per_unit', price_per_unit)
        ELSE jsonb_build_object('min_qty', min_qty, 'price_per_unit', price_per_unit)  -- dernier ouvert
      END
      ORDER BY min_qty ASC
    ) AS new_tiers
  FROM exploded
  WHERE id IN (SELECT id FROM valid_ids)   -- ne réparer QUE les produits aux paliers sains
  GROUP BY id
)
UPDATE public.products p
SET wholesale_tiers = r.new_tiers
FROM rebuilt r
WHERE p.id = r.id
  AND p.wholesale_tiers IS DISTINCT FROM r.new_tiers;  -- IDEMPOTENT : n'écrit que si changement

-- ─────────────────────────────────────────────────────────────────────────────
-- PREVIEW (optionnel) — voir avant/après SANS écrire. Remplacer l'UPDATE ci-dessus
-- par ce SELECT pour contrôler, puis relancer avec l'UPDATE :
--
-- SELECT p.id, p.name, p.wholesale_tiers AS avant, r.new_tiers AS apres
-- FROM public.products p
-- JOIN rebuilt r ON r.id = p.id
-- WHERE p.wholesale_tiers IS DISTINCT FROM r.new_tiers
-- ORDER BY p.name;
-- ─────────────────────────────────────────────────────────────────────────────
