-- =============================================================================
-- Migration 099 — RPC STOCK VARIANTE-AWARE + DOUBLE-ÉCRITURE (Étape 4 du chantier)
-- =============================================================================
-- Réf : docs/ROADMAP_MASTER.md (Étape 4) + docs/ARCHI_VARIANTES_STOCK.md.
--
-- PÉRIMÈTRE — ADDITIF / DOUBLE-ÉCRITURE, ZÉRO FINANCE :
--   Étend les 4 RPC stock WMS-1 pour qu'elles COMPRENNENT la variante + les statuts,
--   SANS changer le comportement existant sur products.stock_count (la bascule = Étape 7).
--   • +p_variant_id (DEFAULT NULL) sur reserve_stock/restore_stock/adjust_stock_manual ;
--     +p_variant_id/+p_from_status/+p_to_status (DEFAULT NULL) sur record_stock_movement.
--   • Résolution : p_variant_id NULL ⇒ variante DÉFAUT du produit (rétro-compat totale —
--     les appelants actuels confirm_cod_order / transition_wholesale_order_status /
--     updateOrderStatus / adjustStock ne passent rien → variante défaut résolue).
--   • DOUBLE-ÉCRITURE : products.stock_count INCHANGÉ (comportement actuel préservé) ET
--     product_variants.stock_count maintenu en parallèle (best-effort, ne casse jamais la vente).
--   • Statuts par défaut écrits au ledger : reserve = at_warehouse→reserved ;
--     restore = reserved→at_warehouse (instantané, comme aujourd'hui — le staging
--     "return_expected" scanné arrive à l'Étape 5/6) ; adjust selon raison/signe.
--   • Trigger : tout NOUVEAU produit reçoit automatiquement une variante défaut (les produits
--     existants l'ont déjà via mig 096) → garantit que la double-écriture a toujours une cible.
--
-- Option A préservée : aucune RPC ne refuse jamais ; la double-écriture variante est en
--   best-effort (si la variante défaut manque, on journalise quand même la vente).
-- balance_after lit toujours products.stock_count (source de vérité jusqu'à l'Étape 7).
-- Idempotente : DROP FUNCTION IF EXISTS (signatures exactes) avant CREATE ; CREATE OR REPLACE trigger.
-- =============================================================================

-- ── 0. Trigger : variante défaut auto pour les NOUVEAUX produits ──────────────

CREATE OR REPLACE FUNCTION public.products_ensure_default_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  -- Crée la variante défaut si le produit n'en a pas encore (idempotent vis-à-vis
  -- du rétro-remplissage 096). COPIE le stock initial (double-écriture).
  SELECT id INTO v_variant_id
    FROM public.product_variants WHERE product_id = NEW.id AND is_default;

  IF v_variant_id IS NULL THEN
    INSERT INTO public.product_variants (product_id, attributes, is_default, stock_count, active)
    VALUES (NEW.id, '{}'::jsonb, true, COALESCE(NEW.stock_count, 0), COALESCE(NEW.active, true))
    RETURNING id INTO v_variant_id;

    -- MOUVEMENT D'OUVERTURE (le journal fait foi) : journalise le stock initial comme
    -- une entrée at_warehouse → la projection variant_status_balance est ABSOLUE et
    -- cohérente avec variant.stock_count. Sentinelle note='__opening_balance__' (idempotence).
    IF COALESCE(NEW.stock_count, 0) <> 0 THEN
      PERFORM public.record_stock_movement(
        NEW.id, NEW.stock_count, 'system', 'reappro',
        NULL, NULL, NULL, '__opening_balance__',
        v_variant_id, NULL, 'at_warehouse'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_ensure_default_variant ON public.products;
CREATE TRIGGER trg_products_ensure_default_variant
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_ensure_default_variant();

-- ── 1. record_stock_movement — + variant_id / from_status / to_status ─────────

DROP FUNCTION IF EXISTS public.record_stock_movement(uuid, integer, text, text, uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id  uuid,
  p_qty_delta   integer,
  p_channel     text,
  p_reason      text,
  p_order_id    uuid    DEFAULT NULL,
  p_order_type  text    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL,
  p_note        text    DEFAULT NULL,
  p_variant_id  uuid    DEFAULT NULL,   -- NOUVEAU (additif)
  p_from_status text    DEFAULT NULL,   -- NOUVEAU (additif)
  p_to_status   text    DEFAULT NULL    -- NOUVEAU (additif)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after integer;
BEGIN
  SELECT stock_count INTO v_balance_after
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_stock_movement : produit % introuvable', p_product_id;
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

COMMENT ON FUNCTION public.record_stock_movement IS
  'Journalise un mouvement de stock (WMS, mig 099). + variant_id/from_status/to_status (additif). '
  'balance_after = products.stock_count (source de vérité jusqu''à Étape 7). '
  'REVOKE total — interne aux fonctions DEFINER uniquement.';

-- ── 2. Helper : résolution de la variante défaut d'un produit ─────────────────

CREATE OR REPLACE FUNCTION public.default_variant_id(p_product_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.product_variants
  WHERE product_id = p_product_id AND is_default
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.default_variant_id(uuid) FROM public, anon, authenticated;

-- ── 3. reserve_stock — + p_variant_id, double-écriture, statut at_warehouse→reserved

DROP FUNCTION IF EXISTS public.reserve_stock(uuid, integer, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL,
  p_variant_id uuid    DEFAULT NULL      -- NOUVEAU (additif) : NULL ⇒ variante défaut
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_stock_before integer;
  v_reason      text;
  v_shortfall   integer;
  v_variant_id  uuid;
BEGIN
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

  -- Résolution variante (défaut si non fournie).
  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- DOUBLE-ÉCRITURE best-effort sur la variante (ne casse jamais la vente).
  IF v_variant_id IS NOT NULL THEN
    BEGIN
      UPDATE public.product_variants
        SET stock_count = stock_count - p_qty
      WHERE id = v_variant_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Journalisation : transition at_warehouse → reserved (la vente réserve le stock).
  PERFORM public.record_stock_movement(
    p_product_id, -p_qty, p_channel, v_reason,
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, 'at_warehouse', 'reserved'
  );

  -- Hook OVERSELL (inchangé) — best-effort.
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
  'WMS (mig 099) : réserve le stock (Option A never-refuse). +p_variant_id (défaut résolu). '
  'Double-écriture products.stock_count (inchangé) + product_variants.stock_count (best-effort). '
  'Ledger : transition at_warehouse→reserved. Oversell → record_anomaly. RETURNS nouveau solde produit.';

-- ── 4. restore_stock — + p_variant_id, double-écriture, statut reserved→at_warehouse

DROP FUNCTION IF EXISTS public.restore_stock(uuid, integer, text, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_reason     text    DEFAULT 'retour',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL,
  p_variant_id uuid    DEFAULT NULL      -- NOUVEAU (additif)
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
BEGIN
  UPDATE public.products SET stock_count = stock_count + p_qty WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_stock : produit % introuvable', p_product_id;
  END IF;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  IF v_variant_id IS NOT NULL THEN
    BEGIN
      UPDATE public.product_variants
        SET stock_count = stock_count + p_qty
      WHERE id = v_variant_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Statut : reserved → at_warehouse (restauration instantanée — comportement actuel ;
  -- le staging "return_expected" scanné sera introduit à l'Étape 5/6).
  PERFORM public.record_stock_movement(
    p_product_id, p_qty, p_channel, 'retour',
    p_order_id, p_order_type, p_actor, NULL,
    v_variant_id, 'reserved', 'at_warehouse'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_stock IS
  'WMS (mig 099) : restaure le stock. +p_variant_id (défaut résolu) + double-écriture variante. '
  'Ledger : transition reserved→at_warehouse (instantané ; staging scanné = Étape 5/6).';

-- ── 5. adjust_stock_manual — + p_variant_id, double-écriture, statut par raison/signe

DROP FUNCTION IF EXISTS public.adjust_stock_manual(uuid, integer, uuid, text, text);

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_product_id uuid,
  p_qty_delta  integer,
  p_actor      uuid    DEFAULT NULL,
  p_note       text    DEFAULT NULL,
  p_reason     text    DEFAULT 'reappro',
  p_variant_id uuid    DEFAULT NULL      -- NOUVEAU (additif)
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

  UPDATE public.products SET stock_count = v_new_balance WHERE id = p_product_id;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));
  IF v_variant_id IS NOT NULL THEN
    BEGIN
      UPDATE public.product_variants
        SET stock_count = stock_count + p_qty_delta
      WHERE id = v_variant_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

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

COMMENT ON FUNCTION public.adjust_stock_manual IS
  'Ajustement manuel (WMS, mig 099). Gate manage_stock, actor=auth.uid(). +p_variant_id (défaut '
  'résolu) + double-écriture variante. Statut : casse/perte→damaged, entrée→at_warehouse, '
  'sortie→NULL. Hooks anomalies inchangés (seuils 20/10). RETURNS nouveau solde produit.';

-- ── 6. BACKFILL — mouvements d'ouverture pour les variantes défaut existantes ──
-- Les variantes créées par le rétro-remplissage 096 ont un stock_count posé en direct
-- (sans mouvement ledger). On journalise leur OUVERTURE (entrée at_warehouse) pour que
-- la projection variant_status_balance soit ABSOLUE. Idempotent : sentinelle '__opening_balance__'.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT v.id AS variant_id, v.product_id, v.stock_count
    FROM public.product_variants v
    WHERE v.is_default
      AND v.stock_count <> 0
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.variant_id = v.id AND m.note = '__opening_balance__'
      )
  LOOP
    PERFORM public.record_stock_movement(
      r.product_id, r.stock_count, 'system', 'reappro',
      NULL, NULL, NULL, '__opening_balance__',
      r.variant_id, NULL, 'at_warehouse'
    );
  END LOOP;
END $$;
