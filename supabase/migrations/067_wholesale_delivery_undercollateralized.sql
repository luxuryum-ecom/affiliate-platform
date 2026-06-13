-- =============================================================================
-- Migration 067 — Détecteur read-only de sous-collatéralisation (LOT 4.2-C)
-- =============================================================================
-- Contexte : le LOT 4.2-C raccorde le flux paiement (updateWholesalePaymentStatus)
--   au RPC de collecte cash livraison try_collect_wholesale_delivery_rebill (065).
--
--   Arbitrage Abdou E3-bis : si l'admin BAISSE deposit_received_amount SOUS le
--   seuil APRÈS qu'une collecte a déjà eu lieu, on NE dé-collecte PAS (la collecte
--   est un fait append-only, garde C-R2 déjà en place) — on se contente d'ALERTER.
--   Pour le LOT 4.2 l'alerte = simple log serveur best-effort ; l'alerting réel
--   (in-app + Telegram) se branchera au LOT 6.
--
-- Cette migration ajoute UNIQUEMENT une fonction de LECTURE qui répond à la
--   question « cette commande est-elle sous-collatéralisée ? » :
--     une collecte existe ET deposit_received_amount < total_amount + delivery_rebill_mad
--
-- CONDITION @finance C-B1 (DURE) : le seuil n'est JAMAIS recalculé en JS/float.
--   La comparaison de montants se fait ICI, EN SQL/numeric — exactement la même
--   expression que le seuil de collecte (065 L.544) : deposit < total + rebill.
--   L'action TypeScript ne fait qu'appeler cette fonction et lire un booléen.
--
-- GARANTIES :
--   - ZÉRO écriture. ZÉRO ledger. ZÉRO colonne touchée. Pure lecture.
--   - Trigger marge compute_wholesale_order_costs (025) intangible et non concerné.
--   - SECURITY DEFINER + garde my_role()='admin' : cohérent avec les RPC cash de
--     065 (le ledger est en lecture admin-seul depuis 063 ; on re-vérifie le rôle
--     car SECURITY DEFINER bypasse RLS). La fonction ne renvoie qu'un booléen,
--     aucune PII ni montant n'est exposé.
-- =============================================================================

DROP FUNCTION IF EXISTS public.is_wholesale_delivery_undercollateralized(uuid);

CREATE OR REPLACE FUNCTION public.is_wholesale_delivery_undercollateralized(
  p_order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result boolean;
BEGIN
  -- ── Garde de rôle : admin seul (cohérent avec 065, bypass RLS = re-vérif) ──
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── Détection : collecte existante ET dépôt repassé sous le seuil ─────────
  -- Le seuil deposit < total + rebill est calculé EN SQL/numeric (C-B1),
  -- expression strictement identique à celle de try_collect (065 L.544).
  SELECT
    EXISTS (
      SELECT 1 FROM public.wholesale_delivery_ledger
      WHERE wholesale_order_id = p_order_id
        AND entry_type = 'delivery_rebill_collected'
    )
    AND EXISTS (
      SELECT 1 FROM public.wholesale_orders o
      WHERE o.id = p_order_id
        AND o.delivery_cost_handling = 'rebilled_client'
        AND o.delivery_rebill_mad > 0
        AND o.deposit_received_amount < o.total_amount + o.delivery_rebill_mad
    )
  INTO v_result;

  RETURN COALESCE(v_result, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_wholesale_delivery_undercollateralized(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.is_wholesale_delivery_undercollateralized(uuid) IS
  'LOT 4.2-C / E3-bis — détecteur READ-ONLY de sous-collatéralisation. '
  'Renvoie true si une collecte delivery_rebill_collected existe ET que '
  'deposit_received_amount < total_amount + delivery_rebill_mad (seuil EN SQL, C-B1). '
  'Admin seul (SECURITY DEFINER + my_role()). ZÉRO écriture, ZÉRO ledger, '
  'aucune dé-collecte (append-only préservé). Sert d''alerte best-effort en 4.2 '
  '(log serveur), l''alerting réel se branche au LOT 6.';
