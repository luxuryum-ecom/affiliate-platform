-- =============================================================================
-- Migration 093 — Option A : never-refuse + tracking + oversell (WMS-1)
-- =============================================================================
-- Contexte : chantier WMS-1 (stock central unifié). Décision Abdou = OPTION A.
-- Le stock peut passer EN NÉGATIF (backorder tracé, alerte admin).
-- On ne refuse JAMAIS une vente pour stock insuffisant.
--
-- CHANGEMENTS DE COMPORTEMENT (audités @finance/@security avant merge) :
--   1. Supprime le CHECK stock_count >= 0 sur products (autorise le négatif).
--   2. Réécrit reserve_stock() : ne refuse jamais, journalise, alerte si négatif.
--   3. Étend restore_stock() : journalise le retour.
--   4. Réécrit confirm_cod_order() : retire le RAISE insufficient_stock.
--   5. Réécrit transition_wholesale_order_status() : retire le RAISE insufficient_stock.
--
-- RÈGLES STRICTEMENT RESPECTÉES :
--   - Zéro touche à un montant, prix, commission, frais COD.
--   - Toutes les transactions restent atomiques (FOR UPDATE conservé).
--   - L'alerte admin (notifications) est best-effort (sous-bloc BEGIN/EXCEPTION).
--   - 100 % idempotent (DROP FUNCTION IF EXISTS, DROP CONSTRAINT IF EXISTS).
--
-- POINT D'ATTENTION @finance :
--   - reserve_stock() RETOURNE maintenant integer (nouveau solde) au lieu de boolean.
--     Les appelants TS (orders.ts) doivent ignorer la vérification "if (!reserved)".
--     Voir migration 093 section 4 (confirm_cod_order) et section 5 (wholesale).
--   - supplier_products.stock_quantity (CHECK >= 0) : NON TOUCHÉ ici (hors périmètre).
--   - Aucun calcul de commission, de prix ou de frais n'est modifié.
--
-- POINT D'ATTENTION @security :
--   - La notification oversell est insérée via createAdminClient() (service_role)
--     côté TS, OU via INSERT direct dans la même transaction SECURITY DEFINER.
--     Ici on insère directement (même tx definer) pour les RPC SQL.
--   - L'INSERT notification est dans un sous-bloc BEGIN/EXCEPTION : une erreur de
--     notification n'annule pas la transaction de vente. Intentionnel.
-- =============================================================================

-- ── 1. Suppression du CHECK stock_count >= 0 ─────────────────────────────────
-- Nom de la contrainte générée automatiquement par Postgres pour la définition
-- inline de 001_initial_schema.sql ligne 35 : CHECK (stock_count >= 0).
-- Postgres nomme les contraintes CHECK inline : <table>_<colonne>_check.
-- Vérifié via \d public.products en local.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_stock_count_check;

-- supplier_products.stock_quantity reste INTACT (NON TOUCHÉ — hors périmètre).

-- ── 2. reserve_stock() — OPTION A (never-refuse, journalise, alerte) ─────────
--
-- Nouvelle signature :
--   reserve_stock(p_product_id uuid, p_qty integer,
--                 p_channel text DEFAULT 'system',
--                 p_order_id uuid DEFAULT NULL,
--                 p_order_type text DEFAULT NULL,
--                 p_actor uuid DEFAULT NULL)
--   RETURNS integer (nouveau solde, peut être négatif)
--
-- Logique :
--   1. SELECT FOR UPDATE (atomicité inchangée).
--   2. UPDATE stock_count = stock_count - p_qty (peut devenir négatif).
--   3. reason = 'oversell' si nouveau solde < 0, sinon 'sale_reserve'.
--   4. PERFORM record_stock_movement(...) dans la même tx.
--   5. Si solde < 0 : INSERT notification best-effort (sous-bloc BEGIN/EXCEPTION).
--   6. RETURN nouveau solde.
--
-- Compatibilité ascendante : l'ancien appelant RPC TS (orders.ts) passe les
-- 2 premiers paramètres uniquement → les DEFAULT couvrent les 4 nouveaux.

DROP FUNCTION IF EXISTS public.reserve_stock(uuid, integer);

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_reason      text;
  v_admin_id    uuid;
BEGIN
  -- Verrou row-level : même atomicité que l'implémentation 004.
  SELECT stock_count - p_qty
  INTO v_new_balance
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reserve_stock : produit % introuvable', p_product_id;
  END IF;

  -- Décrément (peut passer négatif — OPTION A).
  UPDATE public.products
    SET stock_count = v_new_balance
  WHERE id = p_product_id;

  -- Reason : oversell si solde négatif, sinon sale_reserve.
  v_reason := CASE WHEN v_new_balance < 0 THEN 'oversell' ELSE 'sale_reserve' END;

  -- Journalisation (même transaction → balance_after cohérent).
  PERFORM public.record_stock_movement(
    p_product_id,
    -p_qty,             -- qty_delta négatif (sortie)
    p_channel,
    v_reason,
    p_order_id,
    p_order_type,
    p_actor,
    NULL
  );

  -- Alerte admin si oversell (best-effort — n'annule jamais la vente).
  IF v_new_balance < 0 THEN
    BEGIN
      -- Trouve un admin pour recevoir l'alerte.
      SELECT id INTO v_admin_id
        FROM public.profiles
        WHERE role = 'admin'
        LIMIT 1;

      IF v_admin_id IS NOT NULL THEN
        -- P1-B : notifications.order_id a une FK vers wholesale_orders (mig 076).
        -- Pour les canaux affiliate/ecom_perso, p_order_id référence public.orders
        -- → violation FK → exception. Correction : order_id = NULL pour les canaux
        -- non-wholesale ; l'order_id réel est conservé dans payload.
        INSERT INTO public.notifications (
          recipient_id, event, order_id, payload, channels
        ) VALUES (
          v_admin_id,
          'stock_oversell',
          CASE WHEN p_channel = 'wholesale' THEN p_order_id ELSE NULL END,
          jsonb_build_object(
            'product_id',    p_product_id,
            'qty_delta',     -p_qty,
            'balance_after', v_new_balance,
            'channel',       p_channel,
            'order_id',      p_order_id   -- toujours présent dans payload, quelle que soit la FK
          ),
          ARRAY['in_app']
        )
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Notification échoue silencieusement. La vente n'est pas annulée.
      NULL;
    END;
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.reserve_stock IS
  'OPTION A (WMS-1 093) : réserve le stock sans jamais refuser. '
  'Décrément atomique (FOR UPDATE). Peut produire un solde négatif (backorder). '
  'Journalise via record_stock_movement (même tx). '
  'Alerte admin via notifications si oversell (best-effort, sous-bloc BEGIN/EXCEPTION). '
  'RETURNS integer = nouveau solde (peut être < 0). '
  'Les appelants ne doivent PLUS lever errors.insufficient_stock.';

-- ── 3. restore_stock() — étendue, journalise ─────────────────────────────────
--
-- Nouvelle signature :
--   restore_stock(p_product_id uuid, p_qty integer,
--                 p_channel text DEFAULT 'system',
--                 p_reason text DEFAULT 'restore',
--                 p_order_id uuid DEFAULT NULL,
--                 p_order_type text DEFAULT NULL,
--                 p_actor uuid DEFAULT NULL)
--   RETURNS void
--
-- Compatibilité ascendante : l'ancien appelant avec 2 args fonctionne grâce aux DEFAULT.

DROP FUNCTION IF EXISTS public.restore_stock(uuid, integer);

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_reason     text    DEFAULT 'restore',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ré-incrémente le stock (annulation ou retour).
  UPDATE public.products
    SET stock_count = stock_count + p_qty
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_stock : produit % introuvable', p_product_id;
  END IF;

  -- Journalisation (même transaction).
  PERFORM public.record_stock_movement(
    p_product_id,
    p_qty,             -- qty_delta positif (entrée)
    p_channel,
    p_reason,
    p_order_id,
    p_order_type,
    p_actor,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_stock IS
  'OPTION A (WMS-1 093) : restaure le stock (annulation ou retour). '
  'Journalise via record_stock_movement (même tx). RETURNS void.';

-- ── 4. confirm_cod_order() — retire insufficient_stock, passe à Option A ──────
--
-- SEUL CHANGEMENT vs 088 :
--   L'appel à reserve_stock() utilise maintenant la signature étendue
--   (channel, order_id, order_type, actor) ET le RAISE insufficient_stock
--   est supprimé (on continue quelle que soit la valeur de retour).
--   Le reste du corps (idempotence, whitelist statut, UPDATE, gate capacité) :
--   INCHANGÉ.
--
-- Logique canal :
--   affiliate_id IS NULL → channel = 'ecom_perso' (COD ecom perso)
--   affiliate_id IS NOT NULL → channel = 'affiliate'

DROP FUNCTION IF EXISTS public.confirm_cod_order(uuid);

CREATE OR REPLACE FUNCTION public.confirm_cod_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid   uuid;
  v_status       text;
  v_affiliate_id uuid;
  v_product_id   uuid;
  v_quantity     integer;
  v_rows_updated integer;
  v_channel      text;
BEGIN
  -- ── 1. Identité de l'appelant ───────────────────────────────────────────────
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'errors.unauthenticated';
  END IF;

  -- ── 2. Lecture de la commande avec verrou ────────────────────────────────────
  SELECT status, affiliate_id, product_id, quantity
  INTO v_status, v_affiliate_id, v_product_id, v_quantity
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── 3. GATE CAPACITÉ PAR CANAL ────────────────────────────────────────────────
  IF v_affiliate_id IS NULL THEN
    IF NOT public.has_capability('confirm_cod_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  ELSE
    IF NOT public.has_capability('confirm_affiliate_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  END IF;

  -- ── 4. WHITELIST STATUT ────────────────────────────────────────────────────────
  IF v_status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'errors.invalid_status';
  END IF;

  -- ── 5. Réservation stock — OPTION A (never-refuse) ────────────────────────────
  -- Ne lève plus errors.insufficient_stock. Le solde peut devenir négatif.
  -- Canal discriminé par affiliate_id (décision architecture WMS-1).
  v_channel := CASE WHEN v_affiliate_id IS NULL THEN 'ecom_perso' ELSE 'affiliate' END;

  PERFORM public.reserve_stock(
    v_product_id,
    v_quantity,
    v_channel,
    p_order_id,
    'affiliate',   -- order_type pour les orders (table unifiée COD+affilié)
    v_caller_uid
  );

  -- ── 6. UPDATE ÉTROIT : statut + confirmed_at UNIQUEMENT ──────────────────────
  -- Colonnes non touchées : cod_received, cod_expected, commission_amount,
  -- affiliate_commission_mad_snapshot, total_amount, delivery_cost_mad, etc.
  UPDATE public.orders
  SET
    status       = 'confirmed',
    confirmed_at = now()
  WHERE id = p_order_id
    AND status = 'pending_confirmation';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'errors.update_failed';
  END IF;

  -- ── 7. Signal de succès ─────────────────────────────────────────────────────
  RETURN TRUE;

END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cod_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_cod_order(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_cod_order(uuid) IS
  'WMS-1 (093) : confirmation atomique d''une commande COD ou affiliée. '
  'OPTION A : reserve_stock() ne refuse plus (solde peut être négatif). '
  'Errors.insufficient_stock supprimé. Canal discriminé par affiliate_id. '
  'Reste INCHANGÉ : gate capacité, whitelist statut, UPDATE statut+confirmed_at. '
  'Aucune colonne financière touchée. Modèle original : mig 088.';

-- ── 5. transition_wholesale_order_status() — retire insufficient_stock ─────────
--
-- SEUL CHANGEMENT vs 065 :
--   Boucles reserve_stock / restore_stock → signatures étendues + suppression
--   du RAISE insufficient_stock. Le reste (FSM, garde rôle, verrous, timestamps,
--   history, garde C-NR2 delivered) : INCHANGÉ.

DROP FUNCTION IF EXISTS public.transition_wholesale_order_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.transition_wholesale_order_status(
  p_order_id   uuid,
  p_new_status text,
  p_notes      text DEFAULT NULL
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

  -- ── b. Garde de rôle (admin OU agent assigné) ─────────────────────────────
  IF v_caller_role = 'admin' THEN
    NULL;
  ELSIF v_caller_role = 'agent' THEN
    SELECT agent_id INTO v_agent_id
    FROM public.wholesale_orders
    WHERE id = p_order_id;

    IF v_agent_id IS DISTINCT FROM v_caller_uid THEN
      RAISE EXCEPTION 'errors.forbidden_assign_orders';
    END IF;
  ELSE
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── c. Verrou et lecture du statut courant ────────────────────────────────
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
  ) THEN
    RAISE EXCEPTION 'errors.fsm_transition_invalid';
  END IF;

  -- ── [065] Garde C-NR2 : clôture bloquée si coût transport non renseigné ──
  IF p_new_status = 'delivered' THEN
    IF (SELECT delivery_cost_handling FROM public.wholesale_orders WHERE id = p_order_id) = 'rebilled_client'
       AND (SELECT delivery_cost_mad FROM public.wholesale_orders WHERE id = p_order_id) = 0
    THEN
      RAISE EXCEPTION 'errors.delivery_cost_required';
    END IF;
  END IF;

  -- ── f. Réservation de stock — OPTION A (never-refuse) ────────────────────
  -- Ne lève plus errors.insufficient_stock. Solde peut devenir négatif.
  IF p_new_status = 'confirmed' AND v_prev_status = 'pending' THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.reserve_stock(
        r.product_id,
        r.quantity,
        'wholesale',
        p_order_id,
        'wholesale',
        v_caller_uid
      );
    END LOOP;
  END IF;

  -- ── g. Restauration de stock ──────────────────────────────────────────────
  IF p_new_status = 'cancelled'
     AND v_prev_status IN ('confirmed', 'sourcing', 'shipped')
  THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.restore_stock(
        r.product_id,
        r.quantity,
        'wholesale',
        'restore',
        p_order_id,
        'wholesale',
        v_caller_uid
      );
    END LOOP;
  END IF;

  -- ── h. UPDATE wholesale_orders ────────────────────────────────────────────
  -- Aucune colonne financière (supplier_cost_mad, total_amount, etc.) — INCHANGÉ.
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
  'WMS-1 (093) : OPTION A — reserve_stock ne refuse plus (no insufficient_stock). '
  'Journalise les mouvements stock via record_stock_movement. '
  'Reste INCHANGÉ : FSM stricte, garde rôle, verrous FOR UPDATE, timestamps, '
  'history, garde C-NR2 delivered. Aucune colonne financière modifiée. '
  'Modèle original : mig 065.';
