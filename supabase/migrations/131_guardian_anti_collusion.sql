-- =============================================================================
-- Migration 131 — AGENT GARDIEN ANTI-COLLUSION (module Livreurs, Lot G)
-- =============================================================================
-- Réf : LIVRABLE_MODULE_LIVREURS.md §🔒 CHAÎNE DE GARDE + RÈGLE DU PORTEUR (gravée
-- 2026-07-11). Grand livre 121-124 EN PROD, registre couriers 126, scan livraison
-- 127, tournées/retours 128, notifications 129, relevés 130 — TOUS EN PROD.
--
-- PRINCIPE DIRECTEUR : rendre la fraude STRUCTURELLEMENT IMPOSSIBLE, pas seulement
-- détectée. Chaque colis et chaque dirham a TOUJOURS un responsable identifié.
-- Aucun transfert de responsabilité sans DOUBLE CONFIRMATION par 2 comptes distincts.
--
-- PÉRIMÈTRE — ADDITIF PUR, ZÉRO OBJET FINANCIER MODIFIÉ :
--   • Le Lot G est une couche de SURVEILLANCE + de GATE. Il n'écrit JAMAIS le grand
--     livre (ledger_*), ne redéfinit AUCUN trigger/RPC financier (handle_order_*,
--     ledger2_*, reconcile_courier_remittance, v_courier_balances). La chaîne de
--     garde existante (mig 128) reste la SEULE voie d'écriture financière.
--   • RÈGLE DU PORTEUR : à la réception au dépôt, le porteur est DÉDUIT du scan de
--     ramassage (scan_events 'pickup_dispatch', mig 128) — JAMAIS saisi. La RPC
--     record_depot_reception N'ACCEPTE AUCUN courier_id d'imputation → l'imputation
--     croisée est structurellement impossible. Colis sans ramassage = colis fantôme
--     (refus). Confirmation d'un porteur ≠ porteur réel = imputation croisée (refus).
--   • DOUBLE CONFIRMATION ARGENT : un versement déclaré ne fait PAS tomber la dette ;
--     seul un admin (Abdou) confirme la réception → alors la réconciliation existante
--     (reconcile_courier_remittance, mig 122, INCHANGÉE) est appelée. Aucun
--     auto-encaissement possible (la RPC de confirmation est admin-only).
--   • ALERTES append-only ineffaçables (guardian_alerts) : détection de patterns
--     (retour fantôme 48h, réception sans déclaration = collusion, paire livreur↔
--     salarié anormale, dette qui grimpe, versement non confirmé, écart d'inventaire).
--   • SANCTIONS : blocage AUTO pour livreurs PERSO (dépassement/fraude) ; ALERTE +
--     blocage MANUEL pour les SOCIÉTÉS (on ne bloque jamais une société automatiquement).
--
-- TRAÇABILITÉ DU SCANNEUR : les server actions appellent ces RPC via service_role
-- (createAdminClient) → auth.uid() y est NULL. Le vrai salarié/admin est passé
-- explicitement en p_actor_id (dérivé côté serveur de requireCapability/requireAdmin,
-- non falsifiable par le client). C'est le socle de la détection de collusion.
--
-- Idempotente : CREATE ... IF NOT EXISTS, OR REPLACE, DROP ... IF EXISTS.
-- LOCAL UNIQUEMENT (127.0.0.1). Abdou applique en prod séparément APRÈS GO.
-- =============================================================================

-- ── 1. guardian_alerts — journal d'alertes append-only, ineffaçable ──────────
-- Cœur immuable : DELETE toujours refusé ; les colonnes cœur (type/gravité/entités/
-- details/created_at) immuables ; la résolution est WRITE-ONCE (open → resolved/
-- dismissed une seule fois, via resolve_guardian_alert). Un fraudeur ne peut ni
-- effacer, ni réécrire, ni « rouvrir » une alerte.

CREATE TABLE IF NOT EXISTS public.guardian_alerts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type         text        NOT NULL CHECK (alert_type IN (
                                    'ghost_parcel',                  -- colis reçu jamais ramassé
                                    'cross_imputation',              -- tentative d'imputer à un autre porteur
                                    'reception_without_declaration', -- réception sans déclaration livreur = collusion
                                    'return_ghost_48h',              -- retour déclaré non confirmé > 48h
                                    'pattern_courier_staff',         -- paire livreur↔salarié anormalement récurrente
                                    'over_cap',                      -- solde > plafond
                                    'debt_spike',                    -- dette qui grimpe anormalement vite
                                    'cash_declared_pending',         -- versement déclaré, en attente de validation Abdou
                                    'fraud_auto_block',              -- blocage automatique (livreur perso)
                                    'inventory_delta'                -- écart d'inventaire dépôt
                                  )),
  severity           text        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  courier_id         uuid        REFERENCES public.couriers(id),
  order_id           uuid        REFERENCES public.orders(id),
  staff_id           uuid,       -- salarié/acteur impliqué (scanneur), NULL si détection système
  related_courier_id uuid        REFERENCES public.couriers(id), -- 2ᵉ porteur (imputation croisée) ou transporteur
  details            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status             text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by        uuid,
  resolved_at        timestamptz,
  resolution_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_alerts_open      ON public.guardian_alerts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_alerts_courier   ON public.guardian_alerts (courier_id);
CREATE INDEX IF NOT EXISTS idx_guardian_alerts_type      ON public.guardian_alerts (alert_type);

COMMENT ON TABLE public.guardian_alerts IS
  'Journal d''alertes Agent Gardien (Lot G, mig 131), append-only ineffaçable. DELETE toujours '
  'refusé ; colonnes cœur immuables ; résolution write-once (open→resolved/dismissed via '
  'resolve_guardian_alert). Écriture EXCLUSIVEMENT via RPC SECURITY DEFINER. RLS SELECT admin-only.';

ALTER TABLE public.guardian_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guardian_alerts: admin read" ON public.guardian_alerts;
CREATE POLICY "guardian_alerts: admin read"
  ON public.guardian_alerts FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via RPC/service_role uniquement).

-- Garde append-only / write-once (calque durci de scan_events_immutable, mig 100).
CREATE OR REPLACE FUNCTION public.guardian_alerts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'guardian_alerts est ineffaçable (aucun DELETE)';
  END IF;
  -- UPDATE : seule la transition de résolution open → resolved/dismissed est permise,
  -- une seule fois, et uniquement sur les colonnes de résolution.
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'alerte déjà résolue (résolution write-once, ineffaçable)';
  END IF;
  IF NEW.id <> OLD.id
     OR NEW.alert_type <> OLD.alert_type
     OR NEW.severity <> OLD.severity
     OR NEW.created_at <> OLD.created_at
     OR COALESCE(NEW.details::text, '') <> COALESCE(OLD.details::text, '')
     OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
     OR NEW.related_courier_id IS DISTINCT FROM OLD.related_courier_id THEN
    RAISE EXCEPTION 'colonnes cœur de guardian_alerts immuables (seule la résolution est modifiable)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guardian_alerts_guard ON public.guardian_alerts;
CREATE TRIGGER trg_guardian_alerts_guard
  BEFORE UPDATE OR DELETE ON public.guardian_alerts
  FOR EACH ROW EXECUTE FUNCTION public.guardian_alerts_guard();

-- ── 2. courier_staff_pairs — agrégat de pattern (recalculable) ───────────────

CREATE TABLE IF NOT EXISTS public.courier_staff_pairs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id    uuid        NOT NULL REFERENCES public.couriers(id),
  staff_id      uuid        NOT NULL,
  event_count   integer     NOT NULL DEFAULT 0,
  window_days   integer     NOT NULL DEFAULT 30,
  flagged       boolean     NOT NULL DEFAULT false,
  last_event_at timestamptz,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_id, staff_id)
);

COMMENT ON TABLE public.courier_staff_pairs IS
  'Agrégat paire porteur↔salarié (Lot G, mig 131) : nombre de réceptions confirmées par un '
  'même salarié pour un même livreur sur une fenêtre glissante. flagged=true au-delà du seuil '
  '(détection de collusion). Recalculé par detect_courier_staff_patterns. RLS SELECT admin-only.';

ALTER TABLE public.courier_staff_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_staff_pairs: admin read" ON public.courier_staff_pairs;
CREATE POLICY "courier_staff_pairs: admin read"
  ON public.courier_staff_pairs FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- ── 3. courier_blocks — journal des blocages (le POURQUOI, append-only) ──────
-- La vérité du blocage effectif reste couriers.status='blocked'. Cette table trace
-- l'origine (auto perso / manuel société), le motif et l'alerte déclencheuse.

CREATE TABLE IF NOT EXISTS public.courier_blocks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id   uuid        NOT NULL REFERENCES public.couriers(id),
  action       text        NOT NULL CHECK (action IN ('block', 'unblock')),
  block_type   text        NOT NULL CHECK (block_type IN ('auto_personal', 'manual_company', 'manual_personal')),
  reason       text,
  alert_id     uuid        REFERENCES public.guardian_alerts(id),
  triggered_by uuid,       -- admin qui a agi (NULL = système/auto)
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_blocks_courier ON public.courier_blocks (courier_id);

COMMENT ON TABLE public.courier_blocks IS
  'Journal des blocages/déblocages livreur (Lot G, mig 131), append-only. block_type=auto_personal '
  '(automatique, livreurs perso) / manual_company (société, jamais auto) / manual_personal. La '
  'vérité effective reste couriers.status. RLS SELECT admin-only, écriture via RPC.';

ALTER TABLE public.courier_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_blocks: admin read" ON public.courier_blocks;
CREATE POLICY "courier_blocks: admin read"
  ON public.courier_blocks FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.courier_blocks_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'courier_blocks est append-only (ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_courier_blocks_immutable ON public.courier_blocks;
CREATE TRIGGER trg_courier_blocks_immutable
  BEFORE UPDATE OR DELETE ON public.courier_blocks
  FOR EACH ROW EXECUTE FUNCTION public.courier_blocks_immutable();

-- ── 4. courier_cash_confirmations — DOUBLE CONFIRMATION de l'argent ──────────
-- Machine à états (RPC-écrite, comme courier_returns). Un versement DÉCLARÉ reste
-- 'pending' → la dette NE TOMBE PAS. Seul un admin (Abdou) confirme → alors
-- reconcile_courier_remittance (mig 122, INCHANGÉE) est appelée. Aucun
-- auto-encaissement (confirm_cash_receipt est admin-only).

CREATE TABLE IF NOT EXISTS public.courier_cash_confirmations (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id        uuid          NOT NULL REFERENCES public.couriers(id),
  order_ids         uuid[]        NOT NULL,
  declared_amount_mad numeric(12,2) NOT NULL CHECK (declared_amount_mad >= 0),
  method            text          NOT NULL CHECK (method IN ('cash', 'virement')),
  state             text          NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'confirmed', 'rejected')),
  declared_by       uuid,         -- livreur (ou salarié) qui a déclaré le versement
  declared_at       timestamptz   NOT NULL DEFAULT now(),
  confirmed_by      uuid,         -- ADMIN (Abdou) qui valide la réception réelle
  confirmed_at      timestamptz,
  reject_reason     text,
  remittance_id     uuid,         -- rempli APRÈS reconcile (lien vers courier_remittances)
  idempotency_key   text          NOT NULL UNIQUE,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_confirmations_state ON public.courier_cash_confirmations (state);
CREATE INDEX IF NOT EXISTS idx_cash_confirmations_courier ON public.courier_cash_confirmations (courier_id);

COMMENT ON TABLE public.courier_cash_confirmations IS
  'Double confirmation de l''argent (Lot G, mig 131). Un versement déclaré (state=pending) NE FAIT '
  'PAS tomber la dette. Seul un admin confirme (state=confirmed) → reconcile_courier_remittance '
  '(mig 122, inchangée) est appelée pour les commandes du SEUL porteur (zéro compensation croisée). '
  'RLS SELECT admin-only, écriture via RPC SECURITY DEFINER.';

ALTER TABLE public.courier_cash_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_confirmations: admin read" ON public.courier_cash_confirmations;
CREATE POLICY "cash_confirmations: admin read"
  ON public.courier_cash_confirmations FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- ── 5. Inventaire mensuel guidé ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text        NOT NULL,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_by   uuid,
  started_at   timestamptz NOT NULL DEFAULT now(),
  closed_by    uuid,
  closed_at    timestamptz,
  notes        text
);

COMMENT ON TABLE public.inventory_snapshots IS
  'Campagne d''inventaire physique mensuel guidé (Lot G, mig 131). Comptage réel vs système, '
  'écarts chiffrés à la clôture (guardian_alerts inventory_delta). RLS SELECT admin-only.';

ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_snapshots: staff read" ON public.inventory_snapshots;
CREATE POLICY "inventory_snapshots: staff read"
  ON public.inventory_snapshots FOR SELECT TO authenticated
  USING (public.my_role() = 'admin' OR public.has_capability('depot_supervision'));

CREATE TABLE IF NOT EXISTS public.inventory_snapshot_lines (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  uuid        NOT NULL REFERENCES public.inventory_snapshots(id) ON DELETE CASCADE,
  variant_id   uuid        NOT NULL,
  product_id   uuid,
  expected_qty integer     NOT NULL,     -- photo figée du stock système au moment du comptage
  counted_qty  integer,                  -- comptage physique (NULL tant que non compté)
  delta        integer     GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - expected_qty) STORED,
  counted_by   uuid,
  counted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_lines_snapshot ON public.inventory_snapshot_lines (snapshot_id);

COMMENT ON TABLE public.inventory_snapshot_lines IS
  'Lignes d''inventaire (Lot G, mig 131) : expected_qty = stock système figé, counted_qty = '
  'comptage physique, delta généré. RLS SELECT admin/depot_supervision, écriture via RPC.';

ALTER TABLE public.inventory_snapshot_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_lines: staff read" ON public.inventory_snapshot_lines;
CREATE POLICY "inventory_lines: staff read"
  ON public.inventory_snapshot_lines FOR SELECT TO authenticated
  USING (public.my_role() = 'admin' OR public.has_capability('depot_supervision'));

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC (toutes SECURITY DEFINER, SET search_path=public, REVOKE public/anon/
-- authenticated, GRANT service_role). p_actor_id = acteur réel passé par le
-- serveur (auth.uid() est NULL via service_role admin client).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 6. record_guardian_alert — insertion d'alerte dédupliquée (helper) ──────
CREATE OR REPLACE FUNCTION public.record_guardian_alert(
  p_alert_type         text,
  p_severity           text,
  p_courier_id         uuid    DEFAULT NULL,
  p_order_id           uuid    DEFAULT NULL,
  p_staff_id           uuid    DEFAULT NULL,
  p_related_courier_id uuid    DEFAULT NULL,
  p_details            jsonb   DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (public.my_role() = 'admin' OR public.has_capability('depot_supervision') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  -- Dédup : si une alerte OUVERTE du même type existe déjà pour la même entité
  -- (order OU courier), on la réutilise (pas de spam d'alertes).
  SELECT id INTO v_id
  FROM public.guardian_alerts
  WHERE status = 'open'
    AND alert_type = p_alert_type
    AND order_id IS NOT DISTINCT FROM p_order_id
    AND courier_id IS NOT DISTINCT FROM p_courier_id
    AND staff_id IS NOT DISTINCT FROM p_staff_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.guardian_alerts (
    alert_type, severity, courier_id, order_id, staff_id, related_courier_id, details
  ) VALUES (
    p_alert_type, p_severity, p_courier_id, p_order_id, p_staff_id, p_related_courier_id, COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_guardian_alert(text, text, uuid, uuid, uuid, uuid, jsonb) IS
  'Insère une alerte gardien dédupliquée (Lot G, mig 131). Réutilise une alerte OUVERTE identique '
  '(même type + même entité) au lieu d''en créer une nouvelle. Gate admin/depot_supervision/'
  'service_role. REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.record_guardian_alert(text, text, uuid, uuid, uuid, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_guardian_alert(text, text, uuid, uuid, uuid, uuid, jsonb) TO service_role;

-- ── 7. resolve_parcel_bearer — SOURCE DE VÉRITÉ de la RÈGLE DU PORTEUR ───────
-- Le porteur = le livreur qui a la garde du colis APRÈS un scan de RAMASSAGE
-- (scan_events 'pickup_dispatch', mig 128). Renvoie NULL si le colis n'a JAMAIS
-- été ramassé (→ colis fantôme). On exige la ligne pickup_dispatch (preuve de
-- ramassage) ET orders.courier_id (identité du porteur, posée par le pickup).
CREATE OR REPLACE FUNCTION public.resolve_parcel_bearer(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.courier_id
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.courier_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.scan_events s
      WHERE s.order_id = p_order_id AND s.scan_type = 'pickup_dispatch'
    );
$$;

COMMENT ON FUNCTION public.resolve_parcel_bearer(uuid) IS
  'RÈGLE DU PORTEUR (Lot G, mig 131) : résout le porteur d''un colis DEPUIS le scan de ramassage '
  '(scan_events pickup_dispatch, mig 128) + orders.courier_id. NULL si jamais ramassé (colis '
  'fantôme). N''utilise PAS orders.courier_id seul (posé aussi par record_delivery_scan) — la '
  'preuve de garde est le scan pickup. REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.resolve_parcel_bearer(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_parcel_bearer(uuid) TO service_role;

-- ── 8. record_depot_reception — RÉCEPTION GUIDÉE, PORTEUR IMPOSÉ ─────────────
-- Le salarié NE CHOISIT JAMAIS le livreur : la RPC n'accepte AUCUN courier_id
-- d'imputation. Elle DÉDUIT le porteur (resolve_parcel_bearer) et le renvoie pour
-- confirmation VISUELLE. p_confirmed_courier_id (optionnel) = le porteur affiché à
-- l'écran, renvoyé pour anti-tamper : s'il diffère du porteur réel → imputation
-- croisée (refus). Colis jamais ramassé → colis fantôme (refus). Réception sans
-- déclaration préalable → collusion probable : alerte + dette GELÉE (zéro écriture).
CREATE OR REPLACE FUNCTION public.record_depot_reception(
  p_order_id             uuid,
  p_actor_id             uuid,
  p_confirmed_courier_id uuid    DEFAULT NULL,   -- anti-tamper : porteur affiché à l'écran
  p_transporter_note     text    DEFAULT NULL    -- info : transporteur physique du retour (≠ responsabilité)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bearer   uuid;
  v_name     text;
  v_declared boolean;
  v_amount   numeric(12,2);
BEGIN
  IF NOT (
    public.my_role() = 'admin'
    OR public.has_capability('depot_supervision')
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  IF p_order_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'errors.missing_arguments';
  END IF;

  -- ÉTAPE 1 — RÈGLE DU PORTEUR : résolution automatique (jamais de saisie).
  v_bearer := public.resolve_parcel_bearer(p_order_id);

  -- 1a. Colis fantôme : jamais ramassé → REFUS BLOQUANT.
  IF v_bearer IS NULL THEN
    RAISE EXCEPTION 'errors.ghost_parcel';
  END IF;

  -- 1b. Imputation croisée : le porteur confirmé à l'écran ≠ porteur réel → REFUS.
  IF p_confirmed_courier_id IS NOT NULL AND p_confirmed_courier_id <> v_bearer THEN
    RAISE EXCEPTION 'errors.cross_imputation';
  END IF;

  SELECT name INTO v_name FROM public.couriers WHERE id = v_bearer;

  -- Montant COD du colis (affichage « Colis — Porteur — montant MAD »).
  SELECT total_amount INTO v_amount FROM public.orders WHERE id = p_order_id;

  -- @finance P2 — IDEMPOTENCE : colis déjà réceptionné (retour déjà confirmé) → no-op
  -- tracé. Sans ça, un 2ᵉ scan d'un retour déjà confirmé basculerait dans le chemin
  -- « sans déclaration » et lèverait une FAUSSE alerte de collusion critique.
  IF EXISTS (
    SELECT 1 FROM public.courier_returns
    WHERE order_id = p_order_id AND state IN ('confirmed_depot', 'confirmed_company')
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'bearer_id', v_bearer, 'bearer_name', v_name,
      'amount_mad', v_amount, 'path', 'already_received'
    );
  END IF;

  -- ÉTAPE 2 — état de la déclaration du livreur.
  v_declared := EXISTS (
    SELECT 1 FROM public.courier_returns WHERE order_id = p_order_id AND state = 'declared'
  );

  IF v_declared THEN
    -- CHEMIN NOMINAL — double confirmation complète (livreur a déclaré, salarié reçoit).
    -- confirmed_by = p_actor_id (traçabilité réelle du salarié, ≠ Lot D où auth.uid()=NULL).
    UPDATE public.courier_returns
       SET state = 'confirmed_depot', confirmed_at = now(), confirmed_by = p_actor_id,
           notes = COALESCE(notes, '') || CASE WHEN p_transporter_note IS NOT NULL
                     THEN ' [transporteur: ' || p_transporter_note || ']' ELSE '' END
     WHERE order_id = p_order_id AND state = 'declared';

    INSERT INTO public.scan_events (
      scan_type, order_id, order_type, carrier_tracking_ref, scanned_qty, carrier_name, actor_id
    ) VALUES (
      'return_received', p_order_id, 'affiliate', p_order_id::text, 1, p_transporter_note, p_actor_id
    )
    ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING;

    -- Contre-passation via le trigger EXISTANT handle_order_status_reversal (mig 122,
    -- INCHANGÉ). ZÉRO écriture ledger directe ici. La dette du PORTEUR (v_bearer) tombe.
    UPDATE public.orders SET status = 'returned'
     WHERE id = p_order_id AND status NOT IN ('returned', 'cancelled');

    RETURN jsonb_build_object(
      'order_id', p_order_id, 'bearer_id', v_bearer, 'bearer_name', v_name,
      'amount_mad', v_amount, 'path', 'nominal'
    );
  ELSE
    -- CHEMIN COLLUSION — réception physique SANS déclaration préalable du livreur.
    -- Signal de collusion (salarié + livreur). AUCUNE écriture financière : la dette
    -- est GELÉE tant qu'Abdou n'a pas validé (double confirmation non satisfaite).
    PERFORM public.record_guardian_alert(
      'reception_without_declaration', 'critical', v_bearer, p_order_id, p_actor_id, NULL,
      jsonb_build_object('bearer_name', v_name, 'amount_mad', v_amount, 'transporter', p_transporter_note)
    );
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'bearer_id', v_bearer, 'bearer_name', v_name,
      'amount_mad', v_amount, 'path', 'collusion_flagged'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_depot_reception(uuid, uuid, uuid, text) IS
  'Réception au dépôt, PORTEUR IMPOSÉ (Lot G, mig 131, RÈGLE DU PORTEUR). N''accepte AUCUN '
  'courier_id d''imputation → imputation croisée structurellement impossible. Colis jamais ramassé '
  '→ errors.ghost_parcel. p_confirmed_courier_id ≠ porteur réel → errors.cross_imputation. Chemin '
  'nominal (retour déclaré) : réutilise le trigger de contre-passation mig 122 (ZÉRO ledger direct). '
  'Chemin collusion (réception sans déclaration) : alerte critique + dette GELÉE. p_actor_id = '
  'salarié réel (traçabilité). REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.record_depot_reception(uuid, uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_depot_reception(uuid, uuid, uuid, text) TO service_role;

-- ── 9. DOUBLE CONFIRMATION DE L'ARGENT ──────────────────────────────────────

-- 9.1 declare_courier_cash — le versement est DÉCLARÉ (pending). Dette INCHANGÉE.
CREATE OR REPLACE FUNCTION public.declare_courier_cash(
  p_courier_id      uuid,
  p_order_ids       uuid[],
  p_amount_mad      numeric,
  p_method          text,
  p_actor_id        uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   uuid;
  v_name text;
BEGIN
  -- @security P2-3 : surface réduite — déclaration réservée au dépôt (depot_supervision)
  -- ou admin (pas « agent » générique). Le confirmateur (dette qui tombe) reste admin-only.
  IF NOT (public.my_role() = 'admin' OR public.has_capability('depot_supervision') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  IF p_amount_mad IS NULL OR p_amount_mad < 0 THEN
    RAISE EXCEPTION 'errors.invalid_amount';
  END IF;
  IF p_method NOT IN ('cash', 'virement') THEN
    RAISE EXCEPTION 'errors.invalid_method';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.couriers WHERE id = p_courier_id) THEN
    RAISE EXCEPTION 'errors.courier_not_found';
  END IF;

  -- @finance P1 — ZÉRO COMPENSATION CROISÉE (structurel) : chaque commande doit
  -- appartenir AU porteur (orders.courier_id = p_courier_id), être LIVRÉE, et NON
  -- déjà réconciliée. Interdit d'éteindre la dette d'un autre livreur via ce versement.
  IF EXISTS (
    SELECT 1 FROM unnest(p_order_ids) AS u(oid)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = u.oid AND o.courier_id = p_courier_id AND o.status = 'delivered'
    )
    OR EXISTS (SELECT 1 FROM public.courier_remittance_orders cro WHERE cro.order_id = u.oid)
  ) THEN
    RAISE EXCEPTION 'errors.order_not_owned_or_already_reconciled';
  END IF;

  -- Idempotence : rejoue → renvoie l'existant sans doubler.
  SELECT id INTO v_id FROM public.courier_cash_confirmations WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'state', 'pending', 'idempotent', true);
  END IF;

  INSERT INTO public.courier_cash_confirmations (
    courier_id, order_ids, declared_amount_mad, method, state, declared_by, idempotency_key
  ) VALUES (
    p_courier_id, p_order_ids, p_amount_mad, p_method, 'pending', p_actor_id, p_idempotency_key
  )
  RETURNING id INTO v_id;

  SELECT name INTO v_name FROM public.couriers WHERE id = p_courier_id;

  -- 🚨 Alerte Abdou : versement déclaré à valider (la dette ne tombe pas encore).
  PERFORM public.record_guardian_alert(
    'cash_declared_pending', 'warning', p_courier_id, NULL, p_actor_id, NULL,
    jsonb_build_object('confirmation_id', v_id, 'amount_mad', p_amount_mad, 'method', p_method, 'courier_name', v_name)
  );

  RETURN jsonb_build_object('id', v_id, 'state', 'pending', 'idempotent', false);
END;
$$;

COMMENT ON FUNCTION public.declare_courier_cash(uuid, uuid[], numeric, text, uuid, text) IS
  'Déclaration d''un versement livreur (Lot G, mig 131). Crée une confirmation state=pending → la '
  'dette NE TOMBE PAS. Alerte Abdou. Aucune écriture financière. Idempotent. REVOKE public/anon/'
  'authenticated.';

REVOKE ALL ON FUNCTION public.declare_courier_cash(uuid, uuid[], numeric, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.declare_courier_cash(uuid, uuid[], numeric, text, uuid, text) TO service_role;

-- 9.2 confirm_cash_receipt — ADMIN (Abdou) valide → réconciliation. AUCUN auto-encaissement.
CREATE OR REPLACE FUNCTION public.confirm_cash_receipt(
  p_confirmation_id uuid,
  p_actor_id        uuid,
  p_received_amount numeric DEFAULT NULL   -- NULL = on prend le montant déclaré
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf     public.courier_cash_confirmations%ROWTYPE;
  v_name     text;
  v_received numeric(12,2);
  v_remit_id uuid;
BEGIN
  -- ADMIN UNIQUEMENT (double confirmation par un 2ᵉ compte, distinct du déclarant).
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  SELECT * INTO v_conf FROM public.courier_cash_confirmations WHERE id = p_confirmation_id;
  IF v_conf.id IS NULL THEN
    RAISE EXCEPTION 'errors.confirmation_not_found';
  END IF;
  IF v_conf.state <> 'pending' THEN
    -- Idempotent : déjà confirmé → renvoie l'existant.
    RETURN jsonb_build_object('id', v_conf.id, 'state', v_conf.state, 'remittance_id', v_conf.remittance_id, 'idempotent', true);
  END IF;

  -- @security P2-1 — CHAÎNE DE GARDE : 2 COMPTES DISTINCTS (principe fondateur §🔒,
  -- JAMAIS de compte partagé). Le confirmateur ne peut PAS être le déclarant du
  -- versement — grave en base la double confirmation par 2 personnes.
  IF v_conf.declared_by IS NOT NULL AND v_conf.declared_by = p_actor_id THEN
    RAISE EXCEPTION 'errors.same_actor_double_confirm';
  END IF;

  -- @finance P1 — RE-VÉRIFICATION au moment où la dette tombe (défense en profondeur) :
  -- toute commande doit toujours appartenir au porteur, être livrée, et NON déjà
  -- réconciliée par un autre chemin entre-temps. Rend « zéro compensation croisée »
  -- structurel et neutralise tout résidu de double-réconciliation.
  IF EXISTS (
    SELECT 1 FROM unnest(v_conf.order_ids) AS u(oid)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = u.oid AND o.courier_id = v_conf.courier_id AND o.status = 'delivered'
    )
    OR EXISTS (SELECT 1 FROM public.courier_remittance_orders cro WHERE cro.order_id = u.oid)
  ) THEN
    RAISE EXCEPTION 'errors.order_not_owned_or_already_reconciled';
  END IF;

  v_received := COALESCE(p_received_amount, v_conf.declared_amount_mad);
  SELECT name INTO v_name FROM public.couriers WHERE id = v_conf.courier_id;

  -- Réconciliation via la RPC EXISTANTE (mig 122, INCHANGÉE) — la dette du SEUL
  -- porteur tombe (zéro compensation croisée : order_ids restreints à ses commandes).
  -- Clé d'idempotence dérivée de la confirmation (rejoue sûr).
  v_remit_id := public.reconcile_courier_remittance(
    v_name,
    v_received,
    v_conf.order_ids,
    'cash_confirm:' || v_conf.id::text,
    NULL,
    'Double confirmation Abdou (Lot G) — ' || v_conf.method,
    v_conf.courier_id
  );

  UPDATE public.courier_cash_confirmations
     SET state = 'confirmed', confirmed_by = p_actor_id, confirmed_at = now(), remittance_id = v_remit_id
   WHERE id = p_confirmation_id;

  RETURN jsonb_build_object('id', p_confirmation_id, 'state', 'confirmed', 'remittance_id', v_remit_id, 'idempotent', false);
END;
$$;

COMMENT ON FUNCTION public.confirm_cash_receipt(uuid, uuid, numeric) IS
  'ADMIN valide la réception réelle du versement (Lot G, mig 131, DOUBLE CONFIRMATION). C''est le '
  'SEUL point où la dette tombe : appelle reconcile_courier_remittance (mig 122, inchangée) pour '
  'les commandes du seul porteur. admin-only → aucun auto-encaissement par le livreur/salarié. '
  'Idempotent. REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.confirm_cash_receipt(uuid, uuid, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cash_receipt(uuid, uuid, numeric) TO service_role;

-- 9.3 reject_cash_confirmation — ADMIN rejette une déclaration (fraude/erreur).
CREATE OR REPLACE FUNCTION public.reject_cash_confirmation(
  p_confirmation_id uuid,
  p_actor_id        uuid,
  p_reason          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  SELECT state INTO v_state FROM public.courier_cash_confirmations WHERE id = p_confirmation_id;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'errors.confirmation_not_found';
  END IF;
  IF v_state <> 'pending' THEN
    RETURN jsonb_build_object('id', p_confirmation_id, 'state', v_state, 'idempotent', true);
  END IF;
  UPDATE public.courier_cash_confirmations
     SET state = 'rejected', confirmed_by = p_actor_id, confirmed_at = now(), reject_reason = p_reason
   WHERE id = p_confirmation_id;
  RETURN jsonb_build_object('id', p_confirmation_id, 'state', 'rejected', 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_cash_confirmation(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_cash_confirmation(uuid, uuid, text) TO service_role;

-- ── 10. DÉTECTIONS & SANCTIONS ──────────────────────────────────────────────

-- 10.1 detect_ghost_returns — retour déclaré non confirmé depuis > p_hours (48h).
CREATE OR REPLACE FUNCTION public.detect_ghost_returns(p_hours integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  FOR r IN
    SELECT cr.order_id, cr.courier_id, cr.declared_at, c.name
    FROM public.courier_returns cr
    JOIN public.couriers c ON c.id = cr.courier_id
    WHERE cr.state = 'declared'
      AND cr.declared_at < now() - make_interval(hours => p_hours)
  LOOP
    PERFORM public.record_guardian_alert(
      'return_ghost_48h', 'warning', r.courier_id, r.order_id, NULL, NULL,
      jsonb_build_object('courier_name', r.name, 'declared_at', r.declared_at, 'hours', p_hours)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_ghost_returns(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_ghost_returns(integer) TO service_role;

-- 10.2 detect_courier_staff_patterns — paire porteur↔salarié anormalement récurrente.
-- Source : courier_returns (courier_id, confirmed_by=salarié) sur la fenêtre. Seuil
-- configurable p_threshold. Recalcule courier_staff_pairs + alerte au dépassement.
CREATE OR REPLACE FUNCTION public.detect_courier_staff_patterns(
  p_window_days integer DEFAULT 30,
  p_threshold   integer DEFAULT 10
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flagged integer := 0;
  r RECORD;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  FOR r IN
    SELECT cr.courier_id, cr.confirmed_by AS staff_id, COUNT(*) AS cnt, MAX(cr.confirmed_at) AS last_at
    FROM public.courier_returns cr
    WHERE cr.confirmed_by IS NOT NULL
      AND cr.confirmed_at >= now() - make_interval(days => p_window_days)
      AND cr.state IN ('confirmed_depot', 'confirmed_company')
    GROUP BY cr.courier_id, cr.confirmed_by
  LOOP
    INSERT INTO public.courier_staff_pairs (courier_id, staff_id, event_count, window_days, flagged, last_event_at, computed_at)
    VALUES (r.courier_id, r.staff_id, r.cnt, p_window_days, r.cnt >= p_threshold, r.last_at, now())
    ON CONFLICT (courier_id, staff_id) DO UPDATE
      SET event_count = EXCLUDED.event_count,
          window_days = EXCLUDED.window_days,
          flagged = EXCLUDED.flagged,
          last_event_at = EXCLUDED.last_event_at,
          computed_at = now();

    IF r.cnt >= p_threshold THEN
      PERFORM public.record_guardian_alert(
        'pattern_courier_staff', 'warning', r.courier_id, NULL, r.staff_id, NULL,
        jsonb_build_object('event_count', r.cnt, 'window_days', p_window_days, 'threshold', p_threshold)
      );
      v_flagged := v_flagged + 1;
    END IF;
  END LOOP;
  RETURN v_flagged;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_courier_staff_patterns(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_courier_staff_patterns(integer, integer) TO service_role;

-- 10.3 detect_debt_spikes — dette qui grimpe anormalement vite (> p_threshold aujourd'hui).
CREATE OR REPLACE FUNCTION public.detect_debt_spikes(p_threshold_mad numeric DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  FOR r IN
    SELECT b.id AS courier_id, b.name, b.total_balance_mad
    FROM public.v_courier_balances b
    WHERE b.total_balance_mad >= p_threshold_mad
  LOOP
    PERFORM public.record_guardian_alert(
      'debt_spike', 'warning', r.courier_id, NULL, NULL, NULL,
      jsonb_build_object('courier_name', r.name, 'total_balance_mad', r.total_balance_mad, 'threshold_mad', p_threshold_mad)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_debt_spikes(numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_debt_spikes(numeric) TO service_role;

-- 10.4 evaluate_courier_block — SANCTION. Perso = blocage AUTO ; société = alerte seule.
CREATE OR REPLACE FUNCTION public.evaluate_courier_block(p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type    text;
  v_status  text;
  v_over    boolean;
  v_alert   uuid;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  SELECT courier_type, status INTO v_type, v_status FROM public.couriers WHERE id = p_courier_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'errors.courier_not_found';
  END IF;

  SELECT over_cap INTO v_over FROM public.v_courier_balances WHERE id = p_courier_id;
  IF NOT COALESCE(v_over, false) THEN
    RETURN jsonb_build_object('courier_id', p_courier_id, 'action', 'none', 'reason', 'within_cap');
  END IF;

  IF v_type = 'personal' THEN
    -- Livreur PERSO : blocage AUTOMATIQUE immédiat (idempotent si déjà bloqué).
    v_alert := public.record_guardian_alert(
      'fraud_auto_block', 'critical', p_courier_id, NULL, NULL, NULL,
      jsonb_build_object('reason', 'over_cap', 'courier_type', v_type)
    );
    IF v_status <> 'blocked' THEN
      UPDATE public.couriers SET status = 'blocked' WHERE id = p_courier_id;
      INSERT INTO public.courier_blocks (courier_id, action, block_type, reason, alert_id, triggered_by)
      VALUES (p_courier_id, 'block', 'auto_personal', 'Dépassement de plafond (auto)', v_alert, NULL);
    END IF;
    RETURN jsonb_build_object('courier_id', p_courier_id, 'action', 'auto_blocked', 'alert_id', v_alert);
  ELSE
    -- SOCIÉTÉ : JAMAIS de blocage automatique — alerte seule (blocage manuel Abdou).
    v_alert := public.record_guardian_alert(
      'over_cap', 'critical', p_courier_id, NULL, NULL, NULL,
      jsonb_build_object('reason', 'over_cap', 'courier_type', v_type, 'block', 'manual_required')
    );
    RETURN jsonb_build_object('courier_id', p_courier_id, 'action', 'alert_only', 'alert_id', v_alert);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.evaluate_courier_block(uuid) IS
  'Sanction plafond (Lot G, mig 131). Livreur PERSO over_cap → blocage AUTOMATIQUE (couriers.status='
  '''blocked'' + courier_blocks + alerte). SOCIÉTÉ over_cap → alerte SEULE (blocage manuel Abdou, on '
  'ne bloque jamais une société automatiquement). ZÉRO écriture financière (n''affecte pas les '
  'transactions en cours). REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.evaluate_courier_block(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_courier_block(uuid) TO service_role;

-- 10.5 block_courier / unblock_courier — blocage MANUEL tracé (Abdou).
CREATE OR REPLACE FUNCTION public.block_courier(
  p_courier_id uuid,
  p_actor_id   uuid,
  p_reason     text,
  p_block      boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  SELECT courier_type INTO v_type FROM public.couriers WHERE id = p_courier_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'errors.courier_not_found';
  END IF;

  IF p_block THEN
    UPDATE public.couriers SET status = 'blocked' WHERE id = p_courier_id;
    INSERT INTO public.courier_blocks (courier_id, action, block_type, reason, triggered_by)
    VALUES (p_courier_id, 'block',
            CASE WHEN v_type = 'company' THEN 'manual_company' ELSE 'manual_personal' END,
            p_reason, p_actor_id);
    RETURN jsonb_build_object('courier_id', p_courier_id, 'status', 'blocked');
  ELSE
    UPDATE public.couriers SET status = 'active' WHERE id = p_courier_id;
    INSERT INTO public.courier_blocks (courier_id, action, block_type, reason, triggered_by)
    VALUES (p_courier_id, 'unblock',
            CASE WHEN v_type = 'company' THEN 'manual_company' ELSE 'manual_personal' END,
            p_reason, p_actor_id);
    RETURN jsonb_build_object('courier_id', p_courier_id, 'status', 'active');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.block_courier(uuid, uuid, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_courier(uuid, uuid, text, boolean) TO service_role;

-- ── 11. INVENTAIRE mensuel guidé ────────────────────────────────────────────

-- 11.1 open_inventory_snapshot — fige le stock système en lignes à compter.
CREATE OR REPLACE FUNCTION public.open_inventory_snapshot(
  p_period_label text,
  p_actor_id     uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap uuid;
BEGIN
  IF NOT (public.my_role() = 'admin' OR public.has_capability('depot_supervision') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  INSERT INTO public.inventory_snapshots (period_label, status, started_by)
  VALUES (p_period_label, 'open', p_actor_id)
  RETURNING id INTO v_snap;

  -- Photo figée du stock système par variante (stock_count, table product_variants).
  INSERT INTO public.inventory_snapshot_lines (snapshot_id, variant_id, product_id, expected_qty)
  SELECT v_snap, pv.id, pv.product_id, COALESCE(pv.stock_count, 0)
  FROM public.product_variants pv;

  RETURN v_snap;
END;
$$;

REVOKE ALL ON FUNCTION public.open_inventory_snapshot(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_inventory_snapshot(text, uuid) TO service_role;

-- 11.2 record_inventory_count — saisit le comptage physique d'une variante.
CREATE OR REPLACE FUNCTION public.record_inventory_count(
  p_snapshot_id uuid,
  p_variant_id  uuid,
  p_counted_qty integer,
  p_actor_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT (public.my_role() = 'admin' OR public.has_capability('depot_supervision') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  SELECT status INTO v_status FROM public.inventory_snapshots WHERE id = p_snapshot_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'errors.snapshot_not_found';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'errors.snapshot_closed';
  END IF;
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'errors.invalid_count';
  END IF;

  UPDATE public.inventory_snapshot_lines
     SET counted_qty = p_counted_qty, counted_by = p_actor_id, counted_at = now()
   WHERE snapshot_id = p_snapshot_id AND variant_id = p_variant_id;

  RETURN jsonb_build_object('snapshot_id', p_snapshot_id, 'variant_id', p_variant_id, 'counted_qty', p_counted_qty);
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_count(uuid, uuid, integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_count(uuid, uuid, integer, uuid) TO service_role;

-- 11.3 close_inventory_snapshot — clôt + génère les alertes d'écart.
CREATE OR REPLACE FUNCTION public.close_inventory_snapshot(
  p_snapshot_id uuid,
  p_actor_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_deltas integer := 0;
  r RECORD;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  SELECT status INTO v_status FROM public.inventory_snapshots WHERE id = p_snapshot_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'errors.snapshot_not_found';
  END IF;
  IF v_status = 'closed' THEN
    RETURN jsonb_build_object('snapshot_id', p_snapshot_id, 'status', 'closed', 'idempotent', true);
  END IF;

  UPDATE public.inventory_snapshots
     SET status = 'closed', closed_by = p_actor_id, closed_at = now()
   WHERE id = p_snapshot_id;

  FOR r IN
    SELECT variant_id, product_id, expected_qty, counted_qty, delta
    FROM public.inventory_snapshot_lines
    WHERE snapshot_id = p_snapshot_id AND counted_qty IS NOT NULL AND delta <> 0
  LOOP
    PERFORM public.record_guardian_alert(
      'inventory_delta',
      CASE WHEN abs(r.delta) >= 5 THEN 'critical' ELSE 'warning' END,
      NULL, NULL, p_actor_id, NULL,
      jsonb_build_object('snapshot_id', p_snapshot_id, 'variant_id', r.variant_id,
                         'expected', r.expected_qty, 'counted', r.counted_qty, 'delta', r.delta)
    );
    v_deltas := v_deltas + 1;
  END LOOP;

  RETURN jsonb_build_object('snapshot_id', p_snapshot_id, 'status', 'closed', 'deltas', v_deltas);
END;
$$;

REVOKE ALL ON FUNCTION public.close_inventory_snapshot(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_inventory_snapshot(uuid, uuid) TO service_role;

-- ── 12. resolve_guardian_alert — résolution write-once tracée ────────────────
CREATE OR REPLACE FUNCTION public.resolve_guardian_alert(
  p_alert_id uuid,
  p_actor_id uuid,
  p_status   text,          -- 'resolved' | 'dismissed'
  p_reason   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  IF p_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'errors.invalid_status';
  END IF;

  -- Le trigger guardian_alerts_guard interdit de re-résoudre (write-once) et de modifier le cœur.
  UPDATE public.guardian_alerts
     SET status = p_status, resolved_by = p_actor_id, resolved_at = now(), resolution_reason = p_reason
   WHERE id = p_alert_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.alert_not_open';
  END IF;

  RETURN jsonb_build_object('alert_id', p_alert_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_guardian_alert(uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_guardian_alert(uuid, uuid, text, text) TO service_role;

-- ── 13. VUES COCKPIT (security_invoker + rempart admin) ─────────────────────

-- 13.1 Alertes enrichies (nom du porteur, réf commande).
CREATE OR REPLACE VIEW public.v_guardian_alerts
WITH (security_invoker = true) AS
SELECT
  a.id, a.alert_type, a.severity, a.status,
  a.courier_id, c.name AS courier_name, c.courier_type,
  a.order_id, a.staff_id, a.related_courier_id,
  a.details, a.created_at, a.resolved_by, a.resolved_at, a.resolution_reason
FROM public.guardian_alerts a
LEFT JOIN public.couriers c ON c.id = a.courier_id
WHERE (public.my_role() = 'admin' OR auth.role() = 'service_role');

COMMENT ON VIEW public.v_guardian_alerts IS
  'Cockpit gardien (Lot G, mig 131) : alertes enrichies du nom du porteur. security_invoker + '
  'rempart admin.';

-- 13.2 Versements en attente de validation Abdou.
CREATE OR REPLACE VIEW public.v_guardian_pending_cash
WITH (security_invoker = true) AS
SELECT
  cc.id, cc.courier_id, c.name AS courier_name, c.courier_type,
  cc.declared_amount_mad, cc.method, cc.declared_at, cc.declared_by,
  cardinality(cc.order_ids) AS orders_count
FROM public.courier_cash_confirmations cc
JOIN public.couriers c ON c.id = cc.courier_id
WHERE cc.state = 'pending'
  AND (public.my_role() = 'admin' OR auth.role() = 'service_role');

-- 13.3 Retours déclarés en souffrance (âge en heures).
CREATE OR REPLACE VIEW public.v_guardian_open_returns
WITH (security_invoker = true) AS
SELECT
  cr.order_id, cr.courier_id, c.name AS courier_name, cr.declared_at,
  EXTRACT(EPOCH FROM (now() - cr.declared_at)) / 3600.0 AS age_hours
FROM public.courier_returns cr
JOIN public.couriers c ON c.id = cr.courier_id
WHERE cr.state = 'declared'
  AND (public.my_role() = 'admin' OR auth.role() = 'service_role');

-- 13.4 Livreurs à risque (solde vs plafond + statut).
CREATE OR REPLACE VIEW public.v_guardian_courier_risk
WITH (security_invoker = true) AS
SELECT
  b.id AS courier_id, b.name, b.courier_type, b.status,
  b.total_balance_mad, b.balance_cap_mad, b.over_cap,
  (SELECT COUNT(*) FROM public.guardian_alerts a WHERE a.courier_id = b.id AND a.status = 'open') AS open_alerts
FROM public.v_courier_balances b
WHERE (public.my_role() = 'admin' OR auth.role() = 'service_role');

COMMENT ON VIEW public.v_guardian_courier_risk IS
  'Livreurs à risque (Lot G, mig 131) : solde/plafond + nombre d''alertes ouvertes. Lecture pure '
  'sur v_courier_balances (mig 126, inchangée) + guardian_alerts. security_invoker + rempart admin.';

-- =============================================================================
-- FIN migration 131. Périmètre : ADDITIF PUR. Aucun objet financier existant
-- (ledger_*, handle_order_*, ledger2_*, reconcile_courier_remittance,
-- v_courier_balances, couriers/courier_returns/courier_product_debts) N'A ÉTÉ
-- REDÉFINI. Le Lot G lit, surveille, gate et trace — il n'écrit jamais le ledger.
-- =============================================================================
