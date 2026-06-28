-- =============================================================================
-- Migration 105 — ÉTAPE 7.C : la VARIANTE devient la source de vérité du stock
-- =============================================================================
-- Réf : docs/ETAPE7_PLAN_BASCULE_STOCK.md (sous-lot 7.C — C-1 + C-2).
-- Décisions Abdou Q1→Q6 (2026-06-26) : product_variants.stock_count = vérité
-- opérationnelle ; products.stock_count = CACHE DÉRIVÉ maintenu (double-écriture).
--
-- PÉRIMÈTRE — C-1 + C-2, DOUBLE-ÉCRITURE MAINTENUE (RÉVERSIBLE PAR REVERT) :
--   • C-1 (primauté écriture variante) : dans reserve/restore/adjust, l'écriture
--     product_variants.stock_count devient PRIMAIRE/AUTORITAIRE (plus best-effort
--     silencieux). products.stock_count reste écrit en parallèle (MÊME delta) comme
--     CACHE DÉRIVÉ → l'invariant I1 (product == SUM variants) est préservé à
--     l'identique → tout reste réversible par revert tant que la double-écriture tient.
--   • C-2 (balance_after sur la variante) : record_stock_movement calcule désormais
--     balance_after à partir de product_variants.stock_count (la variante du mouvement)
--     au lieu de products.stock_count. Fallback produit si variante absente (rétro-compat).
--     C'est LE point qui fait basculer la VÉRITÉ D'AUDIT (le journal append-only) sur
--     la variante. La variante est TOUJOURS écrite AVANT l'appel au ledger dans les 3
--     RPC → balance_after reflète l'état post-mouvement de la variante.
--
-- CE QUI N'EST **PAS** FAIT ICI (= 7.D, NON-RETOUR, GO ABDOU SÉPARÉ) :
--   • Désactiver la double-écriture products.stock_count (= STOP unique de ce lot).
--   • DROP COLUMN products.stock_count (hors périmètre Étape 7).
--   • Bascule des vues redacted en SUM(variants) live (Q4 = statu quo colonne-cache ;
--     sous double-écriture les vues lisent products.stock_count == SUM → déjà correct).
--
-- Option A préservée : aucune RPC ne refuse jamais ; ni products.stock_count ni
--   product_variants.stock_count n'ont de CHECK >= 0 (mig 093 / 096) → l'oversell
--   reste permis et journalisé (record_anomaly). Idempotente : CREATE OR REPLACE.
-- =============================================================================

-- ── 1. C-2 — record_stock_movement : balance_after = stock de la VARIANTE ──────
-- Signature INCHANGÉE (mig 099). Seul le calcul de balance_after change.

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id  uuid,
  p_qty_delta   integer,
  p_channel     text,
  p_reason      text,
  p_order_id    uuid    DEFAULT NULL,
  p_order_type  text    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL,
  p_note        text    DEFAULT NULL,
  p_variant_id  uuid    DEFAULT NULL,
  p_from_status text    DEFAULT NULL,
  p_to_status   text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after integer;
BEGIN
  -- Étape 7.C (C-2) : la VARIANTE porte la vérité d'audit. balance_after = stock
  -- post-mouvement de la variante (elle est toujours mise à jour AVANT cet appel
  -- dans reserve/restore/adjust). Fallback products.stock_count si variante absente
  -- (rétro-compat : appelants legacy sans variante / produit sans variante défaut).
  IF p_variant_id IS NOT NULL THEN
    SELECT stock_count INTO v_balance_after
      FROM public.product_variants WHERE id = p_variant_id;
  END IF;

  IF v_balance_after IS NULL THEN
    SELECT stock_count INTO v_balance_after
      FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_stock_movement : produit % introuvable', p_product_id;
    END IF;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, channel, qty_delta, reason,
    order_id, order_type, balance_after, actor_id, note,
    variant_id, from_status, to_status
  ) VALUES (
    p_product_id, p_channel, p_qty_delta, p_reason,
    p_order_id, p_order_type, v_balance_after, p_actor, p_note,
    p_variant_id, p_from_status, p_to_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, integer, text, text, uuid, text, uuid, text, uuid, text, text) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.record_stock_movement(uuid, integer, text, text, uuid, text, uuid, text, uuid, text, text) IS
  'Journalise un mouvement de stock (WMS). Étape 7.C (mig 105) : balance_after = '
  'product_variants.stock_count (la VARIANTE est la source de vérité d''audit), '
  'fallback products.stock_count si variante absente. REVOKE total — interne DEFINER.';

-- ── 2. C-1 — reserve_stock : écriture variante PRIMAIRE/autoritaire ────────────
-- products.stock_count reste écrit (cache dérivé, même delta → I1 préservé).

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
  v_new_balance  integer;
  v_stock_before integer;
  v_reason       text;
  v_shortfall    integer;
  v_variant_id   uuid;
BEGIN
  -- Verrou produit (cache) — conserve v_stock_before pour le hook oversell.
  SELECT stock_count, stock_count - p_qty
  INTO v_stock_before, v_new_balance
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reserve_stock : produit % introuvable', p_product_id;
  END IF;

  v_reason := CASE p_channel
    WHEN 'affiliate'  THEN 'vente_affilie'
    WHEN 'wholesale'  THEN 'vente_gros'
    WHEN 'ecom_perso' THEN 'vente_ecom'
    ELSE 'reappro'
  END;

  -- Résolution variante (défaut si non fournie).
  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- C-1 : ÉCRITURE PRIMAIRE sur la variante (autoritaire — plus de swallow silencieux ;
  -- la variante est la source de vérité). Verrou FOR UPDATE. Peut passer négatif
  -- (pas de CHECK >= 0, mig 096 — Option A oversell). La variante défaut existe
  -- toujours (trigger products_ensure_default_variant + rétro-remplissage 096).
  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
      SET stock_count = stock_count - p_qty
    WHERE id = v_variant_id;
  END IF;

  -- CACHE DÉRIVÉ : products.stock_count écrit en parallèle (même delta → I1 préservé,
  -- réversible). Comportement inchangé vs mig 099 (peut passer négatif — Option A).
  UPDATE public.products SET stock_count = v_new_balance WHERE id = p_product_id;

  -- Journalisation : transition at_warehouse → reserved. balance_after = variante (C-2).
  PERFORM public.record_stock_movement(
    p_product_id, -p_qty, p_channel, v_reason,
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, 'at_warehouse', 'reserved'
  );

  -- Hook OVERSELL (inchangé) — best-effort, signal d'anomalie.
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

COMMENT ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid, uuid) IS
  'WMS (mig 105, Étape 7.C) : réserve le stock (Option A never-refuse). C-1 = écriture '
  'PRIMAIRE product_variants.stock_count (autoritaire) ; products.stock_count = cache '
  'dérivé maintenu (double-écriture, I1 préservé). Ledger at_warehouse→reserved, '
  'balance_after = variante. RETURNS nouveau solde produit (cache).';

-- ── 3. C-1 — restore_stock : écriture variante PRIMAIRE/autoritaire ────────────

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_reason     text    DEFAULT 'retour',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL,
  p_variant_id uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  PERFORM 1 FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_stock : produit % introuvable', p_product_id;
  END IF;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- C-1 : écriture PRIMAIRE variante (autoritaire).
  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
      SET stock_count = stock_count + p_qty
    WHERE id = v_variant_id;
  END IF;

  -- Cache dérivé products.stock_count (double-écriture, même delta).
  UPDATE public.products SET stock_count = stock_count + p_qty WHERE id = p_product_id;

  -- Statut : reserved → at_warehouse (restauration instantanée). balance_after = variante.
  PERFORM public.record_stock_movement(
    p_product_id, p_qty, p_channel, 'retour',
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, 'reserved', 'at_warehouse'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid) IS
  'WMS (mig 105, Étape 7.C) : restaure le stock. C-1 = écriture PRIMAIRE variante ; '
  'products.stock_count = cache dérivé (double-écriture). Ledger reserved→at_warehouse, '
  'balance_after = variante.';

-- ── 4. C-1 — adjust_stock_manual : écriture variante PRIMAIRE/autoritaire ───────

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_product_id uuid,
  p_qty_delta  integer,
  p_actor      uuid    DEFAULT NULL,
  p_note       text    DEFAULT NULL,
  p_reason     text    DEFAULT 'reappro',
  p_variant_id uuid    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_loss_threshold         CONSTANT integer := 20;
  c_adjust_count_threshold CONSTANT integer := 10;
  v_new_balance  integer;
  v_stock_before integer;
  v_real_actor   uuid;
  v_loss_24h     integer;
  v_adjust_count integer;
  v_variant_id   uuid;
  v_to_status    text;
BEGIN
  v_real_actor := auth.uid();

  IF NOT public.has_capability('manage_stock') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;
  IF p_qty_delta = 0 THEN
    RAISE EXCEPTION 'errors.stock_delta_zero';
  END IF;
  IF p_reason IN ('vente_affilie', 'vente_gros', 'vente_ecom') THEN
    RAISE EXCEPTION 'errors.invalid_reason';
  END IF;
  IF p_reason NOT IN ('cadeau', 'casse', 'echantillon', 'perte', 'retour', 'reappro') THEN
    RAISE EXCEPTION 'errors.invalid_reason';
  END IF;

  SELECT stock_count, stock_count + p_qty_delta
  INTO v_stock_before, v_new_balance
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.product_not_found';
  END IF;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- C-1 : écriture PRIMAIRE variante (autoritaire).
  IF v_variant_id IS NOT NULL THEN
    UPDATE public.product_variants
      SET stock_count = stock_count + p_qty_delta
    WHERE id = v_variant_id;
  END IF;

  -- Cache dérivé products.stock_count (double-écriture, même delta).
  UPDATE public.products SET stock_count = v_new_balance WHERE id = p_product_id;

  -- Statut d'arrivée selon la raison/signe : casse/perte → damaged ; entrée → at_warehouse ;
  -- sortie manuelle (cadeau/echantillon) → NULL (sortie définitive).
  v_to_status := CASE
    WHEN p_reason IN ('casse', 'perte')            THEN 'damaged'
    WHEN p_qty_delta > 0                            THEN 'at_warehouse'
    ELSE NULL
  END;

  PERFORM public.record_stock_movement(
    p_product_id, p_qty_delta, 'manual_adjust', p_reason,
    NULL, NULL, v_real_actor, p_note,
    v_variant_id,
    CASE WHEN p_qty_delta < 0 THEN 'at_warehouse' ELSE NULL END,
    v_to_status
  );

  -- Hook CASSE/PERTE anormale (inchangé).
  IF p_reason IN ('casse', 'perte') THEN
    BEGIN
      SELECT COALESCE(SUM(ABS(qty_delta)), 0) INTO v_loss_24h
      FROM public.stock_movements
      WHERE actor_id = v_real_actor AND reason IN ('casse', 'perte')
        AND created_at >= now() - interval '24 hours';
      IF v_loss_24h >= c_loss_threshold THEN
        PERFORM public.record_anomaly('abnormal_loss', p_product_id, v_real_actor,
          'manual_adjust', ABS(p_qty_delta), v_stock_before, NULL,
          jsonb_build_object('window_24h_qty', v_loss_24h, 'reason', p_reason,
                             'threshold', c_loss_threshold, 'variant_id', v_variant_id));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Hook AJUSTEMENTS RÉPÉTÉS (inchangé).
  BEGIN
    SELECT COUNT(*) INTO v_adjust_count
    FROM public.stock_movements
    WHERE actor_id = v_real_actor AND channel = 'manual_adjust'
      AND created_at >= now() - interval '24 hours';
    IF v_adjust_count >= c_adjust_count_threshold THEN
      PERFORM public.record_anomaly('repeated_adjust', NULL, v_real_actor, 'manual_adjust',
        NULL, NULL, NULL,
        jsonb_build_object('window_24h_count', v_adjust_count, 'threshold', c_adjust_count_threshold));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text, text, uuid) IS
  'Ajustement manuel (WMS, mig 105, Étape 7.C). Gate manage_stock, actor=auth.uid(). '
  'C-1 = écriture PRIMAIRE variante ; products.stock_count = cache dérivé (double-écriture). '
  'Statut casse/perte→damaged, entrée→at_warehouse, sortie→NULL. Hooks anomalies inchangés. '
  'RETURNS nouveau solde produit (cache).';
