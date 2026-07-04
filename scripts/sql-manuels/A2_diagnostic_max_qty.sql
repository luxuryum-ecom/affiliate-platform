-- ============================================================================
-- A2 — DIAGNOSTIC (LECTURE SEULE) : produits catalogue à risque de SURFACTURATION
-- ----------------------------------------------------------------------------
-- À LANCER PAR ABDOU dans Supabase → SQL Editor (PROD). NE MODIFIE RIEN (SELECT).
--
-- Cible : produits catalogue à ≥2 paliers grossiste dont un palier NON-dernier n'a
-- PAS de max_qty → getWholesaleTier (.find) renvoie le 1er palier (le plus cher)
-- pour les grandes quantités = prix facturé ≠ prix affiché.
--
-- Robuste au DOUBLE-ENCODAGE : certaines lignes legacy stockent wholesale_tiers en
-- jsonb SCALAIRE 'string' (ex. la valeur jsonb est la CHAÎNE "[{...}]") au lieu d'un
-- array. On décode ces lignes avant analyse (sans jamais fabriquer de palier).
-- CTE MATERIALIZED pour figer chaque étape (pas de ré-évaluation du décodage).
-- La colonne total_a_risque (window count) donne le COMPTE ; les lignes = la LISTE.
-- ============================================================================

WITH normalized AS MATERIALIZED (
  -- 1) Ramener wholesale_tiers à un vrai array jsonb (ou '[]' si indécodable).
  SELECT
    p.id,
    p.name,
    p.approval_status,
    p.active,
    CASE
      WHEN jsonb_typeof(p.wholesale_tiers) = 'array' THEN p.wholesale_tiers
      WHEN jsonb_typeof(p.wholesale_tiers) = 'string'
           AND jsonb_typeof((p.wholesale_tiers #>> '{}')::jsonb) = 'array'
        THEN (p.wholesale_tiers #>> '{}')::jsonb
      ELSE '[]'::jsonb
    END AS tiers_arr
  FROM public.products p
  WHERE p.wholesale_tiers IS NOT NULL
),
multi AS MATERIALIZED (
  -- 2) Garder les produits à ≥2 paliers (un seul palier = dernier ouvert, jamais buggé).
  SELECT id, name, approval_status, active, tiers_arr
  FROM normalized
  WHERE jsonb_typeof(tiers_arr) = 'array'
    AND jsonb_array_length(tiers_arr) >= 2
),
exploded AS MATERIALIZED (
  -- 3) Éclater les paliers, numérotés par min_qty croissant ; has_max = borne présente.
  SELECT
    m.id, m.name, m.approval_status, m.active,
    jsonb_array_length(m.tiers_arr) AS n_tiers,
    (elem ? 'max_qty' AND (elem ->> 'max_qty') IS NOT NULL) AS has_max,
    row_number() OVER (
      PARTITION BY m.id ORDER BY (elem ->> 'min_qty')::numeric ASC NULLS LAST
    ) AS rn
  FROM multi m,
       LATERAL jsonb_array_elements(m.tiers_arr) AS elem
),
at_risk AS MATERIALIZED (
  -- 4) À risque = au moins un palier NON-dernier (rn < n_tiers) SANS max_qty.
  SELECT
    id, name, approval_status, active, n_tiers,
    bool_or(rn < n_tiers AND NOT has_max) AS is_at_risk
  FROM exploded
  GROUP BY id, name, approval_status, active, n_tiers
)
SELECT
  count(*) OVER () AS total_a_risque,   -- COMPTE (identique sur chaque ligne)
  id,
  name,
  approval_status,
  active,
  n_tiers
FROM at_risk
WHERE is_at_risk
ORDER BY approval_status, name;

-- Résultat vide  → 0 produit à risque (rien à réparer).
-- Résultat non vide → lancer ensuite A2_repair_max_qty.sql (après GO Abdou).


-- ============================================================================
-- REQUÊTE 2 (optionnelle) — produits catalogue à ≥2 paliers MALFORMÉS (legacy)
-- ----------------------------------------------------------------------------
-- Ces produits seront VOLONTAIREMENT IGNORÉS par la réparation (garde-fou), car
-- leurs paliers ont un min_qty en DOUBLON ou un prix/min_qty nul/invalide → à
-- corriger à la main via le formulaire admin (qui re-valide). Idéalement : vide.
-- ============================================================================

WITH normalized AS MATERIALIZED (
  SELECT
    p.id, p.name, p.approval_status,
    CASE
      WHEN jsonb_typeof(p.wholesale_tiers) = 'array' THEN p.wholesale_tiers
      WHEN jsonb_typeof(p.wholesale_tiers) = 'string'
           AND jsonb_typeof((p.wholesale_tiers #>> '{}')::jsonb) = 'array'
        THEN (p.wholesale_tiers #>> '{}')::jsonb
      ELSE '[]'::jsonb
    END AS tiers_arr
  FROM public.products p
  WHERE p.wholesale_tiers IS NOT NULL
),
multi AS MATERIALIZED (
  SELECT id, name, approval_status, tiers_arr
  FROM normalized
  WHERE jsonb_typeof(tiers_arr) = 'array' AND jsonb_array_length(tiers_arr) >= 2
),
exploded AS MATERIALIZED (
  SELECT
    m.id, m.name, m.approval_status,
    (elem ->> 'min_qty')::numeric        AS min_qty,
    (elem ->> 'price_per_unit')::numeric AS price_per_unit
  FROM multi m, LATERAL jsonb_array_elements(m.tiers_arr) AS elem
)
SELECT id, name, approval_status,
       count(*)                                                       AS n_tiers,
       count(*) FILTER (WHERE min_qty IS NULL)                        AS min_qty_nuls,
       count(*) FILTER (WHERE min_qty IS NOT NULL AND min_qty <> trunc(min_qty)) AS min_qty_non_entiers,
       count(*) FILTER (WHERE price_per_unit IS NULL OR price_per_unit <= 0) AS prix_invalides,
       count(*) - count(DISTINCT min_qty)                             AS doublons_min_qty
FROM exploded
GROUP BY id, name, approval_status
HAVING count(*) FILTER (WHERE min_qty IS NULL OR price_per_unit IS NULL OR price_per_unit <= 0) > 0
    OR count(*) FILTER (WHERE min_qty IS NOT NULL AND min_qty <> trunc(min_qty)) > 0
    OR count(DISTINCT min_qty) <> count(*)
ORDER BY name;
