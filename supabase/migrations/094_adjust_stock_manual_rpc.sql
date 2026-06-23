-- =============================================================================
-- Migration 094 — RPC adjust_stock_manual (WMS-1 — LOT 4)
-- =============================================================================
-- Objectif : permettre à un staff avec manage_stock d'ajuster manuellement le
-- stock d'un produit (correction d'inventaire, réception, etc.).
--
-- Composants :
--   1. RPC adjust_stock_manual(p_product_id, p_qty_delta, p_actor, p_note)
--      SECURITY DEFINER — gate has_capability('manage_stock') — journalise.
--
-- RÈGLES STRICTEMENT RESPECTÉES :
--   - Aucun montant, prix, commission, frais.
--   - stock_count est un integer — p_qty_delta est signé (+ entrée, - sortie).
--   - Après OPTION A (093), pas de CHECK >= 0 sur stock_count → peut devenir
--     négatif sur un ajustement négatif (correction d'inventaire intentionnelle).
--   - RLS : aucune policy INSERT côté authenticated → INSERT via definer only.
--   - service_role jamais exposé côté client.
--   - 100 % idempotent (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_product_id uuid,
  p_qty_delta  integer,
  p_actor      uuid    DEFAULT NULL,  -- ignoré : l'acteur réel est toujours auth.uid() (P2-B)
  p_note       text    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_real_actor  uuid;
BEGIN
  -- P2-B : force l'acteur à auth.uid() — ignore p_actor pour éviter la falsification d'audit.
  -- Le paramètre p_actor est conservé dans la signature pour compatibilité TS, mais ignoré.
  v_real_actor := auth.uid();

  -- Gate capacité : has_capability est SECURITY DEFINER, renvoie true pour admin.
  IF NOT public.has_capability('manage_stock') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;

  -- Garde basique : zéro interdit (enregistré par le CHECK qty_delta <> 0 sur stock_movements).
  IF p_qty_delta = 0 THEN
    RAISE EXCEPTION 'errors.stock_delta_zero';
  END IF;

  -- Verrou row-level pour éviter les races concurrentes.
  SELECT stock_count + p_qty_delta
  INTO v_new_balance
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.product_not_found';
  END IF;

  UPDATE public.products
    SET stock_count = v_new_balance
  WHERE id = p_product_id;

  -- Journalise avec v_real_actor (auth.uid()) — non falsifiable.
  PERFORM public.record_stock_movement(
    p_product_id,
    p_qty_delta,
    'manual_adjust',
    'adjustment',
    NULL,          -- pas d'order_id
    NULL,          -- pas d'order_type
    v_real_actor,  -- acteur réel = auth.uid(), jamais p_actor
    p_note
  );

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.adjust_stock_manual IS
  'Ajustement manuel du stock (WMS-1 094). SECURITY DEFINER. '
  'Gate has_capability(''manage_stock'') (admin ou salarié avec la capacité). '
  'P2-B : p_actor ignoré — l''acteur est toujours auth.uid() (non falsifiable). '
  'Journalise via record_stock_movement. RETURNS integer = nouveau solde. '
  'Appelé par la server action adjustStock (src/app/actions/stock.ts).';
