-- =============================================================================
-- Migration 088 — RPC confirm_cod_order (SECURITY DEFINER)
-- =============================================================================
-- Contexte (P1 détecté par @security) :
--   confirmOrderAsSupervisor effectuait un UPDATE direct sur `orders` via le client
--   RLS standard. La seule policy UPDATE sur orders est admin-only (my_role()='admin',
--   mig 001:300). Un superviseur NON-admin voyait donc 0 ligne mise à jour — sans
--   erreur — et l'action retournait `ok` silencieusement : FAUX SUCCÈS.
--
-- Correction : alignement sur le pattern wholesale (mig 061).
--   Un RPC SECURITY DEFINER encapsule la confirmation et porte lui-même le gate
--   d'autorisation, remplaçant la dépendance à la policy RLS admin-only.
--   L'action TS n'appelle plus que ce RPC et détecte le succès réel.
--
-- PÉRIMÈTRE STRICTEMENT LIMITÉ (régle absolue) :
--   - Transition UNIQUEMENT : pending_confirmation → confirmed
--   - Colonnes touchées : status, confirmed_at — AUCUNE colonne financière
--     (cod_received, cod_expected, commission_amount, affiliate_commission_mad_snapshot,
--      total_amount, prix…)
--   - Le trigger handle_order_delivered (mig 052) ne peut pas être déclenché ici :
--     il ne s'arme QUE sur status='delivered', état inatteignable depuis 'confirmed'.
--   - Réservation de stock via public.reserve_stock() existant (mig 004) — réutilise,
--     ne duplique pas.
--   - AUCUNE policy RLS créée sur orders. La table reste verrouillée ; ce RPC est le
--     seul chemin superviseur, identique au pattern wholesale (mig 061).
--   - AUCUN INSERT ledger, commissions, ou autre table financière.
--
-- 100 % ADDITIF / IDEMPOTENT (DROP FUNCTION IF EXISTS + CREATE OR REPLACE).
-- =============================================================================

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
BEGIN
  -- ── 1. Identité de l'appelant ───────────────────────────────────────────────
  -- SECURITY DEFINER bypasse RLS → on re-vérifie les droits manuellement.
  -- auth.uid() renvoie toujours l'UID de l'utilisateur JWT appelant, même en definer.
  v_caller_uid := auth.uid();

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'errors.unauthenticated';
  END IF;

  -- ── 2. Lecture de la commande avec verrou (évite les races concurrentes) ────
  SELECT status, affiliate_id, product_id, quantity
  INTO v_status, v_affiliate_id, v_product_id, v_quantity
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── 3. GATE CAPACITÉ PAR CANAL ───────────────────────────────────────────────
  -- has_capability() est SECURITY DEFINER et renvoie true pour admin sans condition.
  -- Canal COD ecom perso (affiliate_id IS NULL) → capacité confirm_cod_orders.
  -- Canal affilié (affiliate_id IS NOT NULL)    → capacité confirm_affiliate_orders.
  -- Ce gate remplace la dépendance à la policy RLS UPDATE admin-only.
  IF v_affiliate_id IS NULL THEN
    IF NOT public.has_capability('confirm_cod_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  ELSE
    IF NOT public.has_capability('confirm_affiliate_orders') THEN
      RAISE EXCEPTION 'errors.forbidden';
    END IF;
  END IF;

  -- ── 4. WHITELIST STATUT : uniquement pending_confirmation → confirmed ────────
  -- Aucune autre transition n'est permise par cette fonction.
  -- delivered, returned, cancelled, shipped : inatteignables depuis ici.
  IF v_status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'errors.invalid_status';
  END IF;

  -- ── 5. Réservation stock ────────────────────────────────────────────────────
  -- public.reserve_stock() (mig 004) : SECURITY DEFINER, décrémente stock_count.
  -- Retourne false si insuffisant → on lève une exception pour rollback atomique.
  -- AUCUN effet financier : confirmé par @finance (mig 004, aucune colonne prix).
  IF NOT public.reserve_stock(v_product_id, v_quantity) THEN
    RAISE EXCEPTION 'errors.insufficient_stock';
  END IF;

  -- ── 6. UPDATE ÉTROIT : statut + confirmed_at UNIQUEMENT ─────────────────────
  -- La clause AND status='pending_confirmation' garantit l'idempotence/atomicité :
  -- si une course a déjà confirmé la commande entre le SELECT (étape 2) et ici,
  -- 0 ligne est mise à jour → v_rows_updated = 0 → RAISE, pas de double-confirm.
  --
  -- COLONNES NON TOUCHÉES (liste exhaustive) :
  --   cod_received, cod_expected, commission_amount,
  --   affiliate_commission_mad_snapshot, total_amount,
  --   delivery_cost_mad, platform_margin_mad, factory_cost_mad.
  UPDATE public.orders
  SET
    status       = 'confirmed',
    confirmed_at = now()
  WHERE id = p_order_id
    AND status = 'pending_confirmation';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Race condition : quelqu'un d'autre a confirmé entre-temps, ou statut changé.
    RAISE EXCEPTION 'errors.update_failed';
  END IF;

  -- ── 7. Signal de succès ─────────────────────────────────────────────────────
  -- Retourne TRUE. L'action TS reçoit data=true, error=null → succès réel confirmé.
  -- Toute exception ci-dessus annule la transaction (rollback natif Postgres).
  RETURN TRUE;

END;
$$;

-- Accès : authenticated uniquement. Le gate est dans le corps (has_capability).
-- anon et public n'ont pas d'accès au RPC.
REVOKE ALL ON FUNCTION public.confirm_cod_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_cod_order(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_cod_order(uuid) IS
  'Confirmation atomique d''une commande COD ou affiliée (pending_confirmation → confirmed). '
  'Gate par has_capability selon canal (confirm_cod_orders / confirm_affiliate_orders) ; '
  'admin passe inconditionnellement. Verrou FOR UPDATE, whitelist statut stricte, '
  'réservation stock via reserve_stock(), UPDATE statut+confirmed_at UNIQUEMENT. '
  'Aucune colonne financière touchée. Trigger handle_order_delivered inatteignable '
  '(ne s''arme qu''à delivered). Lève errors.<clé> compatibles pattern i18n TS. '
  'Remplace le UPDATE direct admin-only de confirmOrderAsSupervisor (P1 sécurité). '
  'Modèle : transition_wholesale_order_status (mig 061).';
