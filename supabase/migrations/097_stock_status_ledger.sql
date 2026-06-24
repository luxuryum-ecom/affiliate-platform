-- =============================================================================
-- Migration 097 — STATUTS DE STOCK SUR LE LEDGER (Étape 2 du chantier variantes)
-- =============================================================================
-- Réf : docs/ROADMAP_MASTER.md (Étape 2) + docs/ARCHI_VARIANTES_STOCK.md (section statuts).
--
-- PÉRIMÈTRE STRICT — ADDITIF PUR, ZÉRO FINANCE, ZÉRO RISQUE :
--   • Étend le ledger append-only `stock_movements` avec 3 colonnes NULLABLES :
--       variant_id  (FK product_variants) — quelle variante bouge
--       from_status / to_status — la transition de statut de la/les pièce(s)
--   • Ajoute variant_id (nullable) à stock_anomalies (cohérence Gardien IA).
--   • Crée la PROJECTION `variant_status_balance` (VUE security_invoker, recalculée à
--     chaque lecture depuis le ledger → "le journal fait foi, rien n'est caché").
--
-- MODÈLE (option B = ledger) : chaque mouvement porte from_status/to_status ; les
--   quantités par statut sont DÉRIVÉES par agrégation (jamais stockées en dur). 7 statuts :
--   at_warehouse, reserved, in_transit, delivered, return_expected, return_received, damaged.
--   Convention de comptage : qty d'un statut S = Σ|qty_delta| (to_status=S) − Σ|qty_delta| (from_status=S).
--
-- CE QUE 097 NE FAIT PAS (étapes suivantes) :
--   • Les RPC reserve/restore_stock/adjust_stock_manual n'écrivent PAS encore variant_id/statuts
--     (= Étape 4). Donc toutes les lignes existantes ET nouvelles restent from_status/to_status NULL
--     jusqu'à l'Étape 4 → la projection est correcte mais "vide" tant que rien n'est câblé.
--   • Aucune touche aux commandes, au panier, à l'affichage, à la finance.
--
-- IDEMPOTENTE : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT/VIEW IF EXISTS avant CREATE.
-- Append-only préservé : on AJOUTE des colonnes (DDL), on ne réécrit AUCUNE ligne
--   (le trigger d'immutabilité stock_movements_immutable interdit UPDATE/DELETE — intact).
-- =============================================================================

-- ── 1. Colonnes additives sur stock_movements ───────────────────────────────

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS variant_id  uuid REFERENCES public.product_variants(id);
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS from_status text;
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS to_status   text;

-- CHECK additifs (NULL autorisé → lignes historiques conformes ; pas de réécriture).
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_from_status_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'at_warehouse','reserved','in_transit','delivered',
      'return_expected','return_received','damaged'
    )
  );

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_to_status_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_to_status_check CHECK (
    to_status IS NULL OR to_status IN (
      'at_warehouse','reserved','in_transit','delivered',
      'return_expected','return_received','damaged'
    )
  );

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant
  ON public.stock_movements (variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_status
  ON public.stock_movements (to_status);

COMMENT ON COLUMN public.stock_movements.variant_id IS
  'WMS variantes (mig 097) : variante concernée. NULL = lignes historiques / non câblé (Étape 4).';
COMMENT ON COLUMN public.stock_movements.from_status IS
  'WMS statuts (mig 097) : statut de départ de la pièce. NULL = entrée externe (réception/oversell).';
COMMENT ON COLUMN public.stock_movements.to_status IS
  'WMS statuts (mig 097) : statut d''arrivée. NULL = pas de dimension statut (lignes historiques).';

-- ── 2. variant_id additif sur stock_anomalies (cohérence Gardien IA) ─────────

ALTER TABLE public.stock_anomalies
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id);

CREATE INDEX IF NOT EXISTS idx_stock_anomalies_variant
  ON public.stock_anomalies (variant_id);

COMMENT ON COLUMN public.stock_anomalies.variant_id IS
  'WMS variantes (mig 097) : variante concernée par l''anomalie. NULL = historique / global.';

-- ── 3. Projection variant_status_balance (VUE recalculée, le journal fait foi) ─
-- security_invoker = true → la vue respecte la RLS de stock_movements (admin/manage_stock).
-- Quantité par statut = Σ|qty_delta| entrant vers le statut − Σ|qty_delta| sortant du statut.
-- Reconstructible à 100 % depuis le ledger ; aucune donnée dupliquée/figée.

DROP VIEW IF EXISTS public.variant_status_balance;
CREATE VIEW public.variant_status_balance
WITH (security_invoker = true) AS
SELECT
  product_id,
  variant_id,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'at_warehouse'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'at_warehouse'), 0) AS qty_at_warehouse,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'reserved'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'reserved'), 0) AS qty_reserved,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'in_transit'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'in_transit'), 0) AS qty_in_transit,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'delivered'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'delivered'), 0) AS qty_delivered,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'return_expected'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'return_expected'), 0) AS qty_return_expected,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'return_received'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'return_received'), 0) AS qty_return_received,
  COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE to_status = 'damaged'), 0)
    - COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE from_status = 'damaged'), 0) AS qty_damaged
FROM public.stock_movements
WHERE variant_id IS NOT NULL
  AND (from_status IS NOT NULL OR to_status IS NOT NULL)
GROUP BY product_id, variant_id;

COMMENT ON VIEW public.variant_status_balance IS
  'Projection des quantités par statut et par variante (WMS, mig 097). Recalculée depuis le '
  'ledger append-only stock_movements (le journal fait foi). security_invoker → respecte la RLS. '
  'Vide tant que les RPC ne câblent pas variant_id/statuts (Étape 4). '
  'qty_S = Σ|qty_delta|(to_status=S) − Σ|qty_delta|(from_status=S).';
