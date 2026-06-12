-- =============================================================================
-- Migration 061 — LOT 3c (IMP-3) : transitions de statut atomiques (RPC)
-- =============================================================================
-- Problème : updateWholesaleOrderStatus et assignWholesaleOrder effectuaient
--   plusieurs round-trips DB séparés (boucles stock + UPDATE + INSERT history)
--   sans transaction commune → état partiel en cas d'échec intermédiaire.
--
-- Solution : deux fonctions SECURITY DEFINER qui encapsulent chaque séquence
--   dans une seule transaction Postgres :
--     1. transition_wholesale_order_status — changement de statut + stock + history
--     2. assign_wholesale_order_atomic    — assignation agent + history
--
-- AUCUNE colonne financière touchée.
--   Le trigger compute_wholesale_order_costs (migration 025) est INTANGIBLE.
--   supplier_cost_mad / transport_customs_cost_mad / additional_cost_mad /
--   total_amount / gross_profit_mad / gross_margin_percent ne sont jamais
--   écrits par ces fonctions.
--
-- FSM : réplique EXACTEMENT la table WHOLESALE_ORDER_FSM de
--   src/lib/wholesale-fsm.ts (même états, mêmes arêtes, mêmes terminaux).
-- =============================================================================

-- ── 1. RPC transition_wholesale_order_status ──────────────────────────────────
--
-- Exécute en une transaction atomique :
--   a. Garde de rôle (admin OU agent assigné) — defence in depth (SECURITY DEFINER
--      bypasse RLS, on re-vérifie manuellement).
--   b. Verrou FOR UPDATE sur la commande (évite les races).
--   c. Garde idempotence : rejet si déjà dans l'état cible.
--   d. FSM stricte : rejet de toute transition non autorisée.
--   e. Réservation de stock si pending→confirmed.
--   f. Restauration de stock si transition vers cancelled depuis un état
--      où le stock était réservé (confirmed/sourcing/shipped).
--   g. UPDATE wholesale_orders (statut + timestamps conditionnels + agent_notes).
--   h. INSERT wholesale_order_status_history (append-only).
--
-- Lève des exceptions nommées 'errors.<clé>' compatibles avec le pattern
-- d'extraction côté action : msg.match(/errors\.[a-z_]+/)?.[0]

DROP FUNCTION IF EXISTS public.transition_wholesale_order_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.transition_wholesale_order_status(
  p_order_id  uuid,
  p_new_status text,
  p_notes     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status text;
  v_agent_id    uuid;
  v_caller_role text;
  v_caller_uid  uuid;
  r             RECORD;
BEGIN
  -- ── a. Identité et rôle de l'appelant ────────────────────────────────────
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_uid;

  -- ── b. Garde de rôle (admin OU agent assigné à cette commande) ────────────
  -- On lit agent_id séparément au cas où la commande n'existe pas encore.
  IF v_caller_role = 'admin' THEN
    NULL; -- admin : accès total
  ELSIF v_caller_role = 'agent' THEN
    -- L'agent ne peut agir QUE sur les commandes qui lui sont assignées.
    SELECT agent_id INTO v_agent_id
    FROM public.wholesale_orders
    WHERE id = p_order_id;

    IF v_agent_id IS DISTINCT FROM v_caller_uid THEN
      RAISE EXCEPTION 'errors.forbidden_assign_orders';
    END IF;
  ELSE
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── c. Verrou et lecture du statut courant (FOR UPDATE = sérialisation) ───
  SELECT status, agent_id
  INTO v_prev_status, v_agent_id
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── d. Idempotence ────────────────────────────────────────────────────────
  IF v_prev_status = p_new_status THEN
    RAISE EXCEPTION 'errors.status_already_set';
  END IF;

  -- ── e. FSM stricte — réplique EXACTEMENT wholesale-fsm.ts ────────────────
  --
  -- WHOLESALE_ORDER_FSM = {
  --   pending:            ['assigned', 'confirmed', 'cancelled'],
  --   assigned:           ['supplier_confirmed', 'cancelled'],
  --   supplier_confirmed: ['preparing', 'cancelled'],
  --   preparing:          ['ready', 'cancelled'],
  --   ready:              ['picked_up', 'cancelled'],
  --   picked_up:          ['dispatched', 'cancelled'],
  --   dispatched:         ['delivered', 'cancelled'],
  --   confirmed:          ['sourcing', 'assigned', 'cancelled'],
  --   sourcing:           ['shipped', 'cancelled'],
  --   shipped:            ['delivered', 'cancelled'],
  --   delivered:          [],   -- terminal
  --   cancelled:          [],   -- terminal
  -- }
  --
  -- Toute transition absente de cette table est illégale.

  IF NOT (
    (v_prev_status = 'pending'            AND p_new_status IN ('assigned', 'confirmed', 'cancelled'))           OR
    (v_prev_status = 'assigned'           AND p_new_status IN ('supplier_confirmed', 'cancelled'))              OR
    (v_prev_status = 'supplier_confirmed' AND p_new_status IN ('preparing', 'cancelled'))                       OR
    (v_prev_status = 'preparing'          AND p_new_status IN ('ready', 'cancelled'))                           OR
    (v_prev_status = 'ready'              AND p_new_status IN ('picked_up', 'cancelled'))                       OR
    (v_prev_status = 'picked_up'          AND p_new_status IN ('dispatched', 'cancelled'))                      OR
    (v_prev_status = 'dispatched'         AND p_new_status IN ('delivered', 'cancelled'))                       OR
    (v_prev_status = 'confirmed'          AND p_new_status IN ('sourcing', 'assigned', 'cancelled'))            OR
    (v_prev_status = 'sourcing'           AND p_new_status IN ('shipped', 'cancelled'))                         OR
    (v_prev_status = 'shipped'            AND p_new_status IN ('delivered', 'cancelled'))
    -- delivered et cancelled : états terminaux — aucune transition autorisée
  ) THEN
    RAISE EXCEPTION 'errors.fsm_transition_invalid';
  END IF;

  -- ── f. Réservation de stock : pending → confirmed uniquement ──────────────
  IF p_new_status = 'confirmed' AND v_prev_status = 'pending' THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      IF NOT public.reserve_stock(r.product_id, r.quantity) THEN
        -- RAISE annule toutes les réservations déjà effectuées (rollback natif).
        RAISE EXCEPTION 'errors.insufficient_stock';
      END IF;
    END LOOP;
  END IF;

  -- ── g. Restauration de stock : → cancelled depuis un état réservé ─────────
  -- États où le stock a été réservé : confirmed, sourcing, shipped (cycle legacy).
  -- Le cycle Deliveroo-style n'utilise pas reserve_stock (pas de pending→confirmed).
  IF p_new_status = 'cancelled'
     AND v_prev_status IN ('confirmed', 'sourcing', 'shipped')
  THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.restore_stock(r.product_id, r.quantity);
    END LOOP;
  END IF;

  -- ── h. UPDATE wholesale_orders ────────────────────────────────────────────
  -- Timestamps conditionnels répliqués depuis l'action TS (~L.771-775).
  -- AUCUNE colonne financière (supplier_cost_mad, transport_customs_cost_mad,
  -- additional_cost_mad, total_amount, gross_profit_mad, gross_margin_percent)
  -- n'est touchée — le trigger compute_wholesale_order_costs (025) est intangible.
  UPDATE public.wholesale_orders
  SET
    status       = p_new_status,
    agent_notes  = COALESCE(p_notes, agent_notes),
    confirmed_at = CASE WHEN p_new_status = 'confirmed'  THEN now() ELSE confirmed_at  END,
    sourcing_at  = CASE WHEN p_new_status = 'sourcing'   THEN now() ELSE sourcing_at   END,
    shipped_at   = CASE WHEN p_new_status = 'shipped'    THEN now() ELSE shipped_at    END,
    delivered_at = CASE WHEN p_new_status = 'delivered'  THEN now() ELSE delivered_at  END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled'  THEN now() ELSE cancelled_at  END
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.update_failed';
  END IF;

  -- ── i. INSERT history (append-only) ──────────────────────────────────────
  INSERT INTO public.wholesale_order_status_history
    (order_id, from_status, to_status, changed_by, note)
  VALUES
    (p_order_id, v_prev_status, p_new_status, v_caller_uid, p_notes);

END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_wholesale_order_status(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.transition_wholesale_order_status(uuid, text, text) IS
  'Transition atomique de statut d''une commande grossiste. '
  'Effectue en une seule transaction : garde rôle, verrou FOR UPDATE, '
  'FSM stricte, réservation/restauration de stock, UPDATE commande, INSERT history. '
  'Lève des exceptions ''errors.<clé>'' compatibles avec le pattern i18n des actions TS. '
  'Aucune colonne financière modifiée — trigger compute_wholesale_order_costs intangible.';


-- ── 2. RPC assign_wholesale_order_atomic ─────────────────────────────────────
--
-- Exécute en une transaction atomique :
--   a. Garde de rôle (admin OU membre actif avec assign_orders=true).
--   b. Vérification que l'assignee existe et est role agent/admin (IMP-1).
--   c. Lecture de la commande.
--   d. Idempotence : même agent déjà assigné → no-op silencieux (RETURN).
--   e. FSM si la commande n'est pas encore 'assigned'.
--   f. UPDATE wholesale_orders (agent_id, assigned_at, statut si nécessaire).
--   g. INSERT wholesale_order_status_history (même logique que l'action TS).

DROP FUNCTION IF EXISTS public.assign_wholesale_order_atomic(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.assign_wholesale_order_atomic(
  p_order_id  uuid,
  p_assignee  uuid,
  p_notes     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid    uuid;
  v_assignee_role text;
  v_order_status  text;
  v_order_agent   uuid;
  v_needs_status  boolean;
BEGIN
  -- ── a. Garde de rôle appelant (can_assign_orders = admin OU team_member avec flag) ──
  v_caller_uid := auth.uid();

  IF NOT public.can_assign_orders(v_caller_uid) THEN
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── b. Vérification de l'assignee (IMP-1 : rôle agent ou admin uniquement) ──
  -- Un wholesaler/affiliate/supplier ne peut jamais être assigné à une commande
  -- (hériterait via agent_id d'un accès en lecture/écriture incluant les PII).
  SELECT role INTO v_assignee_role
  FROM public.profiles
  WHERE id = p_assignee;

  IF NOT FOUND OR v_assignee_role NOT IN ('agent', 'admin') THEN
    RAISE EXCEPTION 'errors.assignee_not_found';
  END IF;

  -- ── c. Lecture commande avec verrou ──────────────────────────────────────
  SELECT status, agent_id
  INTO v_order_status, v_order_agent
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── d. Idempotence : même agent déjà assigné → no-op ────────────────────
  IF v_order_agent = p_assignee AND v_order_status = 'assigned' THEN
    RETURN;
  END IF;

  -- ── e. FSM : transition vers 'assigned' si nécessaire ───────────────────
  v_needs_status := (v_order_status <> 'assigned');

  IF v_needs_status THEN
    -- FSM : pending et confirmed peuvent aller vers 'assigned'
    -- (réplique WHOLESALE_ORDER_FSM : pending→assigned, confirmed→assigned)
    IF v_order_status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'errors.fsm_transition_invalid';
    END IF;
  END IF;

  -- ── f. UPDATE wholesale_orders ────────────────────────────────────────────
  IF v_needs_status THEN
    UPDATE public.wholesale_orders
    SET
      agent_id    = p_assignee,
      assigned_at = now(),
      status      = 'assigned'
    WHERE id = p_order_id;
  ELSE
    -- Réassignation d'un autre agent sans changer le statut
    UPDATE public.wholesale_orders
    SET
      agent_id    = p_assignee,
      assigned_at = now()
    WHERE id = p_order_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.update_failed';
  END IF;

  -- ── g. INSERT history (append-only, même logique que l'action TS) ────────
  -- L'action TS insère toujours une ligne history (même pour une réassignation),
  -- avec from_status = statut courant (ou 'assigned' pour une réassignation).
  INSERT INTO public.wholesale_order_status_history
    (order_id, from_status, to_status, changed_by, note)
  VALUES (
    p_order_id,
    CASE WHEN v_needs_status THEN v_order_status ELSE 'assigned' END,
    'assigned',
    v_caller_uid,
    NULL  -- pas de note en dur (i18n côté action)
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_wholesale_order_atomic(uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.assign_wholesale_order_atomic(uuid, uuid, text) IS
  'Assignation atomique d''une commande grossiste à un agent. '
  'Effectue en une seule transaction : garde can_assign_orders, vérification assignee '
  '(rôle agent/admin uniquement), idempotence, FSM, UPDATE commande, INSERT history. '
  'Lève des exceptions ''errors.<clé>'' compatibles avec le pattern i18n des actions TS.';
