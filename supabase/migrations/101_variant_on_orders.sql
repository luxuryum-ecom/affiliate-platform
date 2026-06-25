-- =============================================================================
-- Migration 101 — LOT B Étape 6 (B1) : variant_id sur commandes + restore H1
-- =============================================================================
-- Réf : docs/ARCHI_VARIANTES_STOCK.md + plan @architect Lot B (2026-06-24).
--
-- PÉRIMÈTRE :
--   1. Colonnes variant_id (FK product_variants) sur orders, wholesale_order_items,
--      wholesale_cart_items — ADDITIF, nullable (rétro-compat commandes existantes).
--   2. Contrainte panier (buyer, product, variant) + backfill variante défaut.
--   3. restore_stock H1 : annulation/retour → return_expected (staging, NON vendable).
--      Ne ré-incrémente PLUS products.stock_count ni product_variants.stock_count.
--   4. transition_variant_stock_status : transitions ledger pures (in_transit, delivered).
--   5. confirm_cod_order : lit variant_id depuis la commande → reserve_stock variante.
--   6. transition_wholesale_order_status : variant_id par item + transitions statut.
--
-- FINANCIER : restore_stock H1 change le moment où le stock redevient vendable.
--   Commission / prix / marge INTOUCHÉS (restent au produit).
--
-- IDEMPOTENTE : IF NOT EXISTS, DROP IF EXISTS, CREATE OR REPLACE, DROP FUNCTION IF EXISTS.
-- =============================================================================

-- ── 1. Colonnes variant_id ────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id);

CREATE INDEX IF NOT EXISTS idx_orders_variant
  ON public.orders (variant_id);

COMMENT ON COLUMN public.orders.variant_id IS
  'Lot B (mig 101) : variante commandée. NULL = commande antérieure au chantier variantes.';

ALTER TABLE public.wholesale_order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id);

CREATE INDEX IF NOT EXISTS idx_wholesale_order_items_variant
  ON public.wholesale_order_items (variant_id);

COMMENT ON COLUMN public.wholesale_order_items.variant_id IS
  'Lot B (mig 101) : variante de la ligne wholesale. NULL = lignes antérieures au chantier.';

ALTER TABLE public.wholesale_cart_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id);

CREATE INDEX IF NOT EXISTS idx_wholesale_cart_items_variant
  ON public.wholesale_cart_items (variant_id);

COMMENT ON COLUMN public.wholesale_cart_items.variant_id IS
  'Lot B (mig 101) : variante dans le panier wholesale. Backfill vers variante défaut.';

-- ── 2. Contrainte panier — granularité par variante ───────────────────────────

ALTER TABLE public.wholesale_cart_items
  DROP CONSTRAINT IF EXISTS wholesale_cart_items_buyer_id_product_id_key;

DROP INDEX IF EXISTS public.uniq_cart_buyer_product_variant;

CREATE UNIQUE INDEX uniq_cart_buyer_product_variant
  ON public.wholesale_cart_items (
    buyer_id,
    product_id,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ── 3. Backfill panier existant → variante défaut ─────────────────────────────

UPDATE public.wholesale_cart_items c
SET variant_id = (
  SELECT v.id
  FROM public.product_variants v
  WHERE v.product_id = c.product_id
    AND v.is_default
  LIMIT 1
)
WHERE c.variant_id IS NULL;

-- ── 4. transition_variant_stock_status — transitions ledger pures ─────────────
-- Mouvements informationnels (in_transit, delivered) : aucun changement stock_count.

CREATE OR REPLACE FUNCTION public.transition_variant_stock_status(
  p_product_id  uuid,
  p_qty         integer,
  p_variant_id  uuid,
  p_from_status text,
  p_to_status   text,
  p_channel     text    DEFAULT 'system',
  p_reason      text    DEFAULT 'transition',
  p_order_id    uuid    DEFAULT NULL,
  p_order_type  text    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'transition_variant_stock_status : qty doit être > 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'transition_variant_stock_status : produit % introuvable', p_product_id;
  END IF;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  PERFORM public.record_stock_movement(
    p_product_id, p_qty, p_channel, p_reason,
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, p_from_status, p_to_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_variant_stock_status(
  uuid, integer, uuid, text, text, text, text, uuid, text, uuid
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transition_variant_stock_status(
  uuid, integer, uuid, text, text, text, text, uuid, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.transition_variant_stock_status IS
  'Lot B (mig 101) : transition de statut ledger pure (ex. reserved→in_transit, in_transit→delivered). '
  'Aucun changement sur products.stock_count. Utilisé par COD shipped/delivered et wholesale FSM.';

-- ── 5. restore_stock — H1 : reserved/in_transit/delivered → return_expected ──
-- NE ré-incrémente PAS le stock vendable. Le retour au dépôt se fait PAR SCAN uniquement.

DROP FUNCTION IF EXISTS public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_reason     text    DEFAULT 'retour',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL,
  p_variant_id uuid    DEFAULT NULL,
  p_from_status text   DEFAULT 'reserved'   -- NOUVEAU : statut source (reserved/in_transit/delivered)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'restore_stock : qty doit être > 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'restore_stock : produit % introuvable', p_product_id;
  END IF;

  -- H1 : PAS de UPDATE products.stock_count — le stock n'est pas vendable tant qu'il
  -- n'est pas scanné au dépôt (record_scan return_received sellable).

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- H1 : PAS de double-écriture product_variants.stock_count non plus.

  -- Ledger : staging return_expected (NON vendable, en attente de scan physique).
  PERFORM public.record_stock_movement(
    p_product_id, p_qty, p_channel, COALESCE(NULLIF(p_reason, ''), 'retour'),
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, COALESCE(NULLIF(p_from_status, ''), 'reserved'), 'return_expected'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.restore_stock IS
  'Lot B H1 (mig 101) : staging retour → return_expected (NON vendable). '
  'Ne ré-incrémente PLUS products.stock_count. Retour vendable = scan record_scan uniquement. '
  '+p_from_status (défaut reserved) : reserved/in_transit/delivered selon le contexte.';

-- ── 6. confirm_cod_order — lit variant_id depuis la commande ─────────────────

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
  v_variant_id   uuid;
  v_rows_updated integer;
  v_channel      text;
BEGIN
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'errors.unauthenticated';
  END IF;

  SELECT status, affiliate_id, product_id, quantity, variant_id
  INTO v_status, v_affiliate_id, v_product_id, v_quantity, v_variant_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  IF v_affiliate_id IS NULL THEN
    IF NOT public.has_capability('confirm_cod_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  ELSE
    IF NOT public.has_capability('confirm_affiliate_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  END IF;

  IF v_status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'errors.invalid_status';
  END IF;

  v_channel := CASE WHEN v_affiliate_id IS NULL THEN 'ecom_perso' ELSE 'affiliate' END;
  v_variant_id := COALESCE(v_variant_id, public.default_variant_id(v_product_id));

  PERFORM public.reserve_stock(
    v_product_id,
    v_quantity,
    v_channel,
    p_order_id,
    'affiliate',
    v_caller_uid,
    v_variant_id
  );

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

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cod_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_cod_order(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_cod_order(uuid) IS
  'Lot B (mig 101) : confirmation COD/affilié. Lit variant_id depuis orders → reserve_stock variante. '
  'OPTION A never-refuse. Aucune colonne financière touchée. Modèle : mig 088/093.';

-- ── 7. transition_wholesale_order_status — variant_id + transitions statut ───

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
  v_from_status text;
  r             RECORD;
BEGIN
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_uid;

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

  SELECT status, agent_id
  INTO v_prev_status, v_agent_id
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  IF v_prev_status = p_new_status THEN
    RAISE EXCEPTION 'errors.status_already_set';
  END IF;

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

  IF p_new_status = 'delivered' THEN
    IF (SELECT delivery_cost_handling FROM public.wholesale_orders WHERE id = p_order_id) = 'rebilled_client'
       AND (SELECT delivery_cost_mad FROM public.wholesale_orders WHERE id = p_order_id) = 0
    THEN
      RAISE EXCEPTION 'errors.delivery_cost_required';
    END IF;
  END IF;

  -- Réservation stock : pending → confirmed (variante par item)
  IF p_new_status = 'confirmed' AND v_prev_status = 'pending' THEN
    FOR r IN
      SELECT product_id, quantity, variant_id
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.reserve_stock(
        r.product_id,
        r.quantity,
        'wholesale',
        p_order_id,
        'wholesale',
        v_caller_uid,
        COALESCE(r.variant_id, public.default_variant_id(r.product_id))
      );
    END LOOP;
  END IF;

  -- Expédition : sourcing → shipped (reserved → in_transit)
  IF p_new_status = 'shipped' AND v_prev_status = 'sourcing' THEN
    FOR r IN
      SELECT product_id, quantity, variant_id
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.transition_variant_stock_status(
        r.product_id,
        r.quantity,
        COALESCE(r.variant_id, public.default_variant_id(r.product_id)),
        'reserved',
        'in_transit',
        'wholesale',
        'expedition',
        p_order_id,
        'wholesale',
        v_caller_uid
      );
    END LOOP;
  END IF;

  -- Livraison : shipped → delivered (in_transit → delivered)
  IF p_new_status = 'delivered' AND v_prev_status = 'shipped' THEN
    FOR r IN
      SELECT product_id, quantity, variant_id
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.transition_variant_stock_status(
        r.product_id,
        r.quantity,
        COALESCE(r.variant_id, public.default_variant_id(r.product_id)),
        'in_transit',
        'delivered',
        'wholesale',
        'livraison',
        p_order_id,
        'wholesale',
        v_caller_uid
      );
    END LOOP;
  END IF;

  -- Annulation : → return_expected (H1 staging, statut source selon l'état)
  IF p_new_status = 'cancelled'
     AND v_prev_status IN ('confirmed', 'sourcing', 'shipped')
  THEN
    v_from_status := CASE v_prev_status
      WHEN 'shipped' THEN 'in_transit'
      ELSE 'reserved'
    END;

    FOR r IN
      SELECT product_id, quantity, variant_id
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.restore_stock(
        r.product_id,
        r.quantity,
        'wholesale',
        'retour',
        p_order_id,
        'wholesale',
        v_caller_uid,
        COALESCE(r.variant_id, public.default_variant_id(r.product_id)),
        v_from_status
      );
    END LOOP;
  END IF;

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

  INSERT INTO public.wholesale_order_status_history
    (order_id, from_status, to_status, changed_by, note)
  VALUES
    (p_order_id, v_prev_status, p_new_status, v_caller_uid, p_notes);

END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_wholesale_order_status(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.transition_wholesale_order_status(uuid, text, text) IS
  'Lot B (mig 101) : FSM wholesale + variant_id par item. '
  'Reserve (pending→confirmed), in_transit (sourcing→shipped), delivered (shipped→delivered), '
  'return_expected H1 (cancel). Garde C-NR2 delivered. Aucune colonne financière touchée.';
