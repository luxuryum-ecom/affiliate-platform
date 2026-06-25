-- =============================================================================
-- Migration 102 — SÉCURITÉ LOT B : gardes rôle + validation cross-product
-- =============================================================================
-- Réf : audit @security 2026-06-25, points 1-6 (HOLD → GO).
--
-- PÉRIMÈTRE :
--   1. reserve_stock      : + garde rôle (admin/agent) + validation variant cross-product.
--   2. restore_stock      : + garde rôle (admin/agent). Signature H1 de mig 101.
--   3. transition_variant_stock_status : + garde rôle (admin/agent). Mig 101.
--   4. confirm_cod_order  : + validation cross-product v_variant_id.product_id = v_product_id.
--   5. transition_wholesale_order_status : REVOKE ALL FROM public, anon (manquait en mig 101).
--
-- RÈGLE OPTION A PRÉSERVÉE :
--   Les gardes rôle bloquent les appels DIRECTS non autorisés via PostgREST.
--   Elles ne bloquent JAMAIS une vente légitime : les flux passent par des RPCs
--   SECURITY DEFINER (confirm_cod_order, transition_wholesale_order_status) qui
--   sont elles-mêmes gatées et dont l'appelant est admin/agent.
--   La validation cross-product lève une exception seulement si un UUID invalide
--   est injecté — jamais sur une variante correctement associée au produit.
--
-- IDEMPOTENTE : DROP FUNCTION IF EXISTS avant chaque CREATE.
-- =============================================================================

-- ── 1. reserve_stock — garde rôle + validation cross-product ─────────────────

DROP FUNCTION IF EXISTS public.reserve_stock(uuid, integer, text, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL,
  p_variant_id uuid    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_new_balance  integer;
  v_stock_before integer;
  v_reason       text;
  v_shortfall    integer;
  v_variant_id   uuid;
BEGIN
  -- Garde rôle : seuls admin et agent peuvent appeler cette RPC directement
  -- (ou via une chaîne SECURITY DEFINER où auth.uid() conserve leur UID).
  -- Bloque les appels PostgREST directs d'un affilié/grossiste/fournisseur.
  SELECT role INTO v_caller_role
  FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'reserve_stock : qty doit être > 0';
  END IF;

  -- Validation cross-product : si une variante est fournie, elle doit appartenir
  -- au produit de la commande. Empêche qu'une variante d'un produit X soit utilisée
  -- pour décrémenter le stock d'un produit Y.
  IF p_variant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE id = p_variant_id AND product_id = p_product_id
    ) THEN
      RAISE EXCEPTION 'errors.variant_product_mismatch';
    END IF;
  END IF;

  SELECT stock_count, stock_count - p_qty
  INTO v_stock_before, v_new_balance
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reserve_stock : produit % introuvable', p_product_id;
  END IF;

  -- products.stock_count : comportement INCHANGÉ (peut passer négatif — Option A).
  UPDATE public.products SET stock_count = v_new_balance WHERE id = p_product_id;

  v_reason := CASE p_channel
    WHEN 'affiliate'  THEN 'vente_affilie'
    WHEN 'wholesale'  THEN 'vente_gros'
    WHEN 'ecom_perso' THEN 'vente_ecom'
    ELSE 'reappro'
  END;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  IF v_variant_id IS NOT NULL THEN
    BEGIN
      UPDATE public.product_variants
        SET stock_count = stock_count - p_qty
      WHERE id = v_variant_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  PERFORM public.record_stock_movement(
    p_product_id, -p_qty, p_channel, v_reason,
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, 'at_warehouse', 'reserved'
  );

  IF v_new_balance < 0 THEN
    v_shortfall := GREATEST(p_qty - GREATEST(v_stock_before, 0), 0);
    BEGIN
      PERFORM public.record_anomaly(
        'oversell', p_product_id, p_actor, p_channel, p_qty, v_stock_before, v_shortfall,
        jsonb_build_object('balance_after', v_new_balance, 'order_id', p_order_id,
                           'order_type', p_order_type, 'variant_id', v_variant_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reserve_stock IS
  'WMS (mig 099 + sécurité 102) : réserve le stock (Option A never-refuse). '
  'Garde rôle admin/agent. Validation cross-product variant_id. '
  '+p_variant_id (défaut résolu). Double-écriture + ledger at_warehouse→reserved.';

-- ── 2. restore_stock — garde rôle (signature H1 mig 101) ─────────────────────

DROP FUNCTION IF EXISTS public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id  uuid,
  p_qty         integer,
  p_channel     text    DEFAULT 'system',
  p_reason      text    DEFAULT 'retour',
  p_order_id    uuid    DEFAULT NULL,
  p_order_type  text    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL,
  p_variant_id  uuid    DEFAULT NULL,
  p_from_status text    DEFAULT 'reserved'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_variant_id  uuid;
BEGIN
  -- Garde rôle : seuls admin et agent peuvent déclencher un retour stock.
  SELECT role INTO v_caller_role
  FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;

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

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.restore_stock IS
  'Lot B H1 (mig 101) + sécurité (mig 102) : staging retour → return_expected (NON vendable). '
  'Garde rôle admin/agent. Ne ré-incrémente PLUS products.stock_count. '
  'Retour vendable = scan record_scan uniquement. +p_from_status (défaut reserved).';

-- ── 3. transition_variant_stock_status — garde rôle ──────────────────────────

DROP FUNCTION IF EXISTS public.transition_variant_stock_status(
  uuid, integer, uuid, text, text, text, text, uuid, text, uuid
);

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
  v_caller_role text;
  v_variant_id  uuid;
BEGIN
  -- Garde rôle : seuls admin et agent peuvent déclencher des transitions ledger.
  SELECT role INTO v_caller_role
  FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;

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
  'Lot B (mig 101) + sécurité (mig 102) : transition de statut ledger pure. '
  'Garde rôle admin/agent. Aucun changement sur products.stock_count.';

-- ── 4. confirm_cod_order — validation cross-product v_variant_id ──────────────

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

  v_channel    := CASE WHEN v_affiliate_id IS NULL THEN 'ecom_perso' ELSE 'affiliate' END;
  v_variant_id := COALESCE(v_variant_id, public.default_variant_id(v_product_id));

  -- Validation cross-product : si la commande porte un variant_id (injecté par le client
  -- au moment de placeOrder), il doit appartenir au produit de cette commande.
  -- Défense en profondeur côté DB — le check TypeScript amont est la première ligne.
  IF v_variant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE id = v_variant_id AND product_id = v_product_id
    ) THEN
      RAISE EXCEPTION 'errors.variant_product_mismatch';
    END IF;
  END IF;

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
  'Lot B (mig 101) + sécurité (mig 102) : confirmation COD/affilié. '
  'Lit variant_id depuis orders → validation cross-product → reserve_stock variante. '
  'OPTION A never-refuse. Aucune colonne financière touchée.';

-- ── 5. transition_wholesale_order_status — REVOKE manquant ───────────────────
-- En mig 101, la fonction a été DROP+RECREATE sans REVOKE préalable.
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut sur une nouvelle fonction.
-- La garde interne (auth.uid() + role check) protège déjà, mais on aligne
-- sur le pattern de toutes les autres RPCs sensibles de ce chantier.

REVOKE ALL ON FUNCTION public.transition_wholesale_order_status(uuid, text, text)
  FROM public, anon;
-- Le GRANT TO authenticated est déjà posé en mig 101 — pas besoin de le refaire.

COMMENT ON FUNCTION public.transition_wholesale_order_status IS
  'Lot B (mig 101) + sécurité (mig 102) : FSM wholesale + variant_id par item. '
  'REVOKE public/anon ajouté. Garde interne admin/agent intacte. '
  'Reserve (pending→confirmed), in_transit (sourcing→shipped), delivered, return_expected H1.';
