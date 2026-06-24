-- =============================================================================
-- Migration 100 — SCAN ENTRÉE DÉPÔT + RETOUR (Étape 5 du chantier variantes)
-- =============================================================================
-- Réf : docs/ROADMAP_MASTER.md (Étape 5) + docs/ARCHI_VARIANTES_STOCK.md (section scan).
--
-- PÉRIMÈTRE — ADDITIF, ZÉRO FINANCE :
--   • Table `scan_events` append-only immuable (RLS deny, comme stock_movements/anomalies).
--   • RPC `record_scan` SECURITY DEFINER (gate manage_stock) : déclenche les transitions de
--     statut via record_stock_movement + double-écriture variante. Idempotence anti-fraude :
--     UNIQUE(scan_type, carrier_tracking_ref, order_id) → un même colis tracé ne compte qu'1 fois.
--   • Multi-transporteur GÉNÉRIQUE : carrier_name / carrier_tracking_ref = TEXTE LIBRE,
--     aucun transporteur câblé.
--   • Transitions : inbound_reception → at_warehouse ; return_received sellable :
--     return_expected → at_warehouse (revient vendable) ; return_received damaged :
--     return_expected → damaged (isolé, non vendable).
--
-- NOTE : le câblage "annulation → return_expected" (staging amont) = Étape 6 (avec @finance).
--   Ici on AJOUTE la capacité scan ; record_scan opère de façon autonome/manuelle.
-- Convention qty_delta : nombre de pièces déplacées (le projection variant_status_balance
--   lit from/to_status + ABS(qty_delta)). Pour return_received damaged, products.stock_count
--   n'est PAS modifié (la pièce n'était pas vendable) ; pour les entrées vendables, products +qty.
--
-- RÉCONCILIATION ARGENT TRANSPORTEUR = REPORTÉE (formats fichiers non disponibles) — se
--   branchera plus tard sur scan_events. NON conçue ici.
-- Idempotente : CREATE ... IF NOT EXISTS, DROP POLICY/FUNCTION IF EXISTS.
-- =============================================================================

-- ── 1. Table scan_events (append-only) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scan_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type            text        NOT NULL CHECK (scan_type IN ('inbound_reception','return_received')),
  product_id           uuid        REFERENCES public.products(id),
  variant_id           uuid        REFERENCES public.product_variants(id),
  order_id             uuid,
  order_type           text        CHECK (order_type IN ('affiliate','wholesale') OR order_type IS NULL),
  -- Transporteur GÉNÉRIQUE : texte libre, aucun transporteur câblé.
  carrier_name         text,
  carrier_tracking_ref text,
  scanned_qty          integer     NOT NULL CHECK (scanned_qty > 0),
  condition            text        CHECK (condition IN ('sellable','damaged') OR condition IS NULL),
  actor_id             uuid,
  scanned_at           timestamptz NOT NULL DEFAULT now()
);

-- Idempotence anti-fraude : un même (type, tracking, commande) ne peut être inséré 2×.
-- (NULL-distinct par défaut → la dédup s'applique quand carrier_tracking_ref + order_id sont fournis.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_scan_events_idem
  ON public.scan_events (scan_type, carrier_tracking_ref, order_id);

CREATE INDEX IF NOT EXISTS idx_scan_events_variant ON public.scan_events (variant_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_scanned_at ON public.scan_events (scanned_at DESC);

COMMENT ON TABLE public.scan_events IS
  'Événements de scan dépôt/retour (WMS, mig 100). Append-only immuable, RLS deny par défaut. '
  'Multi-transporteur générique (carrier/tracking = texte libre). Écriture via record_scan() '
  'SECURITY DEFINER uniquement. Idempotence anti-fraude UNIQUE(scan_type, carrier_tracking_ref, order_id).';

-- ── 2. RLS deny par défaut (lecture admin/manage_stock, aucune écriture cliente) ─

ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scan_events: admin or manage_stock read" ON public.scan_events;
CREATE POLICY "scan_events: admin or manage_stock read"
  ON public.scan_events
  FOR SELECT TO authenticated
  USING (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via record_scan DEFINER seulement).

-- ── 3. Trigger d'immutabilité (append-only strict, comme stock_movements) ─────

CREATE OR REPLACE FUNCTION public.scan_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'scan_events est append-only (ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_scan_events_immutable ON public.scan_events;
CREATE TRIGGER trg_scan_events_immutable
  BEFORE UPDATE OR DELETE ON public.scan_events
  FOR EACH ROW EXECUTE FUNCTION public.scan_events_immutable();

-- ── 4. record_scan — vecteur d'écriture unique + transitions de statut ────────

DROP FUNCTION IF EXISTS public.record_scan(text, integer, uuid, uuid, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.record_scan(
  p_scan_type    text,
  p_scanned_qty  integer,
  p_product_id   uuid,
  p_variant_id   uuid    DEFAULT NULL,
  p_order_id     uuid    DEFAULT NULL,
  p_order_type   text    DEFAULT NULL,
  p_carrier_name text    DEFAULT NULL,
  p_tracking_ref text    DEFAULT NULL,
  p_condition    text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      uuid;
  v_variant_id uuid;
  v_scan_id    uuid;
BEGIN
  v_actor := auth.uid();

  -- Gate capacité (admin passe via has_capability/my_role en amont des policies).
  IF NOT public.has_capability('manage_stock') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;
  IF p_scanned_qty IS NULL OR p_scanned_qty <= 0 THEN
    RAISE EXCEPTION 'errors.invalid_qty';
  END IF;
  IF p_scan_type NOT IN ('inbound_reception','return_received') THEN
    RAISE EXCEPTION 'errors.invalid_scan_type';
  END IF;

  v_variant_id := COALESCE(p_variant_id, public.default_variant_id(p_product_id));

  -- IDEMPOTENCE ANTI-FRAUDE : insertion du scan ; si déjà scanné (même type/tracking/commande)
  -- → ON CONFLICT DO NOTHING → v_scan_id reste NULL → AUCUN effet stock (anti double-comptage).
  INSERT INTO public.scan_events (
    scan_type, product_id, variant_id, order_id, order_type,
    carrier_name, carrier_tracking_ref, scanned_qty, condition, actor_id
  ) VALUES (
    p_scan_type, p_product_id, v_variant_id, p_order_id, p_order_type,
    p_carrier_name, p_tracking_ref, p_scanned_qty, p_condition, v_actor
  )
  ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING
  RETURNING id INTO v_scan_id;

  IF v_scan_id IS NULL THEN
    RETURN NULL;  -- déjà scanné → no-op idempotent
  END IF;

  -- EFFET STOCK selon le type de scan.
  IF p_scan_type = 'inbound_reception' THEN
    -- Réception : entrée au dépôt (vendable +). Double-écriture.
    UPDATE public.products SET stock_count = stock_count + p_scanned_qty WHERE id = p_product_id;
    IF v_variant_id IS NOT NULL THEN
      BEGIN UPDATE public.product_variants SET stock_count = stock_count + p_scanned_qty WHERE id = v_variant_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    PERFORM public.record_stock_movement(
      p_product_id, p_scanned_qty, 'system', 'reappro',
      p_order_id, p_order_type, v_actor, 'scan:inbound_reception',
      v_variant_id, NULL, 'at_warehouse'
    );

  ELSIF p_scan_type = 'return_received' THEN
    IF COALESCE(p_condition, 'sellable') = 'damaged' THEN
      -- Retour endommagé : isolé en 'damaged' (PAS vendable). products.stock_count INCHANGÉ.
      PERFORM public.record_stock_movement(
        p_product_id, p_scanned_qty, 'return', 'casse',
        p_order_id, p_order_type, v_actor, 'scan:return_damaged',
        v_variant_id, 'return_expected', 'damaged'
      );
    ELSE
      -- Retour vendable : revient au dépôt (vendable +). Double-écriture.
      UPDATE public.products SET stock_count = stock_count + p_scanned_qty WHERE id = p_product_id;
      IF v_variant_id IS NOT NULL THEN
        BEGIN UPDATE public.product_variants SET stock_count = stock_count + p_scanned_qty WHERE id = v_variant_id;
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END IF;
      PERFORM public.record_stock_movement(
        p_product_id, p_scanned_qty, 'return', 'retour',
        p_order_id, p_order_type, v_actor, 'scan:return_received',
        v_variant_id, 'return_expected', 'at_warehouse'
      );
    END IF;
  END IF;

  RETURN v_scan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_scan(text, integer, uuid, uuid, uuid, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_scan(text, integer, uuid, uuid, uuid, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.record_scan IS
  'Enregistre un scan (réception dépôt / retour reçu) et déclenche la transition de statut '
  '(WMS, mig 100). SECURITY DEFINER, gate has_capability(manage_stock), actor=auth.uid(). '
  'Idempotent (ON CONFLICT DO NOTHING → no-op si déjà scanné). RETURNS scan id, ou NULL si doublon. '
  'sellable: return_expected→at_warehouse (+vendable) ; damaged: return_expected→damaged (isolé) ; '
  'inbound_reception: →at_warehouse (+vendable). Multi-transporteur générique (texte libre).';
