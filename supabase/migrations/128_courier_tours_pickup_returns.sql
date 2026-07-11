-- =============================================================================
-- Migration 128 — Tournées + scan ramassage + retours 3 cas (module Livreurs, Lot D)
-- =============================================================================
-- Réf : CLAUDE.md (grand livre 121-125 EN PROD, registre couriers mig 126 EN PROD,
-- scan livraison mig 127 EN PROD), LIVRABLE_MODULE_LIVREURS.md §🔒 CHAÎNE DE GARDE.
--
-- PRINCIPE CHAÎNE DE GARDE (verrouillé) : chaque colis a TOUJOURS un responsable.
-- Transfert de garde dépôt→livreur = scan pickup (compte salarié perso). Un retour
-- déclaré par le livreur passe par l'état RETOUR_DÉCLARÉ_NON_CONFIRMÉ : la dette du
-- livreur reste INCHANGÉE tant qu'un salarié/admin n'a pas confirmé (DOUBLE
-- CONFIRMATION). Aucun retour ne s'auto-valide.
--
-- PÉRIMÈTRE — ADDITIF PUR, ZÉRO DOUBLON DU GRAND LIVRE / DE v_courier_balances :
--   • scan_events (mig 100/127) : CHECK scan_type += 'pickup_dispatch' (sortie dépôt).
--   • courier_tours / courier_tour_orders : regroupement des commandes d'une tournée.
--   • courier_returns : machine à états du retour (declared → confirmed_depot /
--     confirmed_company / lost). AUCUNE écriture ledger tant que 'declared'.
--   • record_pickup_scan : transfert de garde (orders.courier_id) — ZÉRO écriture
--     ledger (le pickup est un mouvement de garde, pas un mouvement financier).
--   • declare_courier_return : déclaration livreur — AUCUN changement orders.status,
--     AUCUN ledger (dette inchangée, cf. §🔒).
--   • confirm_return_depot / confirm_return_company : confirment le retour →
--     orders.status='returned' → le trigger EXISTANT handle_order_status_reversal
--     (mig 122, EN PROD, INCHANGÉ) contre-passe le ledger si la commande était
--     'delivered' (idempotent, idempotency_key cod_reversal:<order_id>). RÉUTILISE
--     le mécanisme existant, N'ÉCRIT JAMAIS ledger_transactions/ledger_entries ici.
--   • mark_return_lost : la PERTE est une créance PRODUIT (courier_product_debts,
--     mig 126, append-only, déjà sommée par v_courier_balances). AUCUNE nouvelle
--     écriture ledger globale — question ouverte @finance documentée en commentaire
--     (une perte pourrait aussi justifier une écriture de dépréciation stock/coût
--     usine côté grand livre ; NON codée ici sur consigne explicite du prompt).
--
-- Idempotente : CREATE ... IF NOT EXISTS, DROP POLICY/CONSTRAINT/FUNCTION IF EXISTS.
-- LOCAL UNIQUEMENT (127.0.0.1) — appliquée ici via `supabase db push`. Abdou
-- applique en prod séparément après GO.
-- =============================================================================

-- ── 1. Extension scan_events : scan_type += 'pickup_dispatch' (sortie dépôt) ─
-- Superset des 4 valeurs existantes (mig 100/127) + la nouvelle. Ne casse rien
-- (DROP + ADD du même CHECK, additif pur).

ALTER TABLE public.scan_events DROP CONSTRAINT IF EXISTS scan_events_scan_type_check;
ALTER TABLE public.scan_events
  ADD CONSTRAINT scan_events_scan_type_check
  CHECK (scan_type IN (
    'inbound_reception', 'return_received', 'delivered_collected',
    'delivery_refused', 'pickup_dispatch'
  ));

-- ── 2. Tournées ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.courier_tours (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id  uuid        NOT NULL REFERENCES public.couriers(id),
  tour_date   date        NOT NULL DEFAULT current_date,
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dispatched', 'closed')),
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_tours_courier ON public.courier_tours (courier_id);

COMMENT ON TABLE public.courier_tours IS
  'Tournée de ramassage/livraison d''un livreur (Lot D, mig 128). Regroupement logique de '
  'commandes pour une journée. Écriture EXCLUSIVEMENT via service_role/server actions admin-'
  'staff — aucune policy INSERT/UPDATE/DELETE (deny par défaut). RLS SELECT staff-only.';

ALTER TABLE public.courier_tours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_tours: staff read" ON public.courier_tours;
CREATE POLICY "courier_tours: staff read"
  ON public.courier_tours FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via service_role uniquement).

CREATE TABLE IF NOT EXISTS public.courier_tour_orders (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id    uuid        NOT NULL REFERENCES public.courier_tours(id) ON DELETE CASCADE,
  order_id   uuid        NOT NULL UNIQUE REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_tour_orders_tour ON public.courier_tour_orders (tour_id);

COMMENT ON TABLE public.courier_tour_orders IS
  'Lien commande ↔ tournée (Lot D, mig 128). UNIQUE(order_id) : une commande appartient à AU '
  'PLUS UNE tournée à la fois. Écriture EXCLUSIVEMENT via service_role. RLS SELECT staff-only.';

ALTER TABLE public.courier_tour_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_tour_orders: staff read" ON public.courier_tour_orders;
CREATE POLICY "courier_tour_orders: staff read"
  ON public.courier_tour_orders FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via service_role uniquement).

-- ── 3. Machine à états retours (chaîne de garde, DOUBLE CONFIRMATION) ────────

CREATE TABLE IF NOT EXISTS public.courier_returns (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        NOT NULL UNIQUE REFERENCES public.orders(id),
  courier_id     uuid        NOT NULL REFERENCES public.couriers(id),
  state          text        NOT NULL DEFAULT 'declared'
                              CHECK (state IN ('declared', 'confirmed_depot', 'confirmed_company', 'lost')),
  declared_at    timestamptz DEFAULT now(),
  declared_by    uuid,
  confirmed_at   timestamptz,
  confirmed_by   uuid,
  company_ref    text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.courier_returns IS
  'Machine à états du retour livreur (Lot D, mig 128, chaîne de garde §🔒). state=''declared'' '
  '(RETOUR_DÉCLARÉ_NON_CONFIRMÉ) : la dette du livreur reste INCHANGÉE — AUCUN ledger, AUCUN '
  'changement orders.status. Confirmation (''confirmed_depot''/''confirmed_company'') par un '
  'salarié/admin uniquement (DOUBLE CONFIRMATION) → alors orders.status=''returned'' et le '
  'trigger EXISTANT handle_order_status_reversal (mig 122) contre-passe le ledger. ''lost'' = '
  'perte constatée → créance PRODUIT (courier_product_debts). Écriture EXCLUSIVEMENT via RPC '
  'SECURITY DEFINER (service_role). RLS SELECT staff-only.';

ALTER TABLE public.courier_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_returns: staff read" ON public.courier_returns;
CREATE POLICY "courier_returns: staff read"
  ON public.courier_returns FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via RPC/service_role uniquement).

-- ── 4. RPCs (SECURITY DEFINER, REVOKE public/anon/authenticated, GRANT service_role) ─

-- 4.1 record_pickup_scan — transfert de garde dépôt→livreur. ZÉRO écriture ledger.
CREATE OR REPLACE FUNCTION public.record_pickup_scan(
  p_order_id   uuid,
  p_courier_id uuid,
  p_tour_id    uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    -- @security P2-1 : moindre privilège — admin OU capacité dépôt explicite (pas
    -- « agent » générique), OU service_role (chemin server action gardé). La RPC
    -- reste sûre même si son GRANT était un jour élargi.
    public.my_role() = 'admin'
    OR public.has_capability('depot_supervision')
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  IF p_order_id IS NULL OR p_courier_id IS NULL THEN
    RAISE EXCEPTION 'errors.missing_arguments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.couriers WHERE id = p_courier_id AND status = 'active') THEN
    RAISE EXCEPTION 'errors.courier_not_active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- Transfert de garde dépôt → livreur (mouvement de garde, pas financier).
  UPDATE public.orders SET courier_id = p_courier_id WHERE id = p_order_id;

  IF p_tour_id IS NOT NULL THEN
    INSERT INTO public.courier_tour_orders (tour_id, order_id)
    VALUES (p_tour_id, p_order_id)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  INSERT INTO public.scan_events (
    scan_type, order_id, order_type, carrier_tracking_ref, scanned_qty, actor_id
  ) VALUES (
    'pickup_dispatch', p_order_id, 'affiliate', p_order_id::text, 1, auth.uid()
  )
  ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING;

  RETURN jsonb_build_object('order_id', p_order_id, 'courier_id', p_courier_id, 'tour_id', p_tour_id);
END;
$$;

COMMENT ON FUNCTION public.record_pickup_scan(uuid, uuid, uuid) IS
  'Scan ramassage dépôt (Lot D, mig 128). Transfert de garde UNIQUEMENT (orders.courier_id) — '
  'ZÉRO écriture ledger (le pickup n''est pas un mouvement financier, décision verrouillée '
  'LIVRABLE_MODULE_LIVREURS.md §🔒). Trace scan_events (pickup_dispatch), lie éventuellement '
  'la commande à une tournée. REVOKE public/anon/authenticated — service_role uniquement.';

REVOKE ALL ON FUNCTION public.record_pickup_scan(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pickup_scan(uuid, uuid, uuid) TO service_role;

-- 4.2 declare_courier_return — déclaration livreur (portail /courier, cloisonné).
-- AUCUN changement orders.status, AUCUN ledger : RETOUR_DÉCLARÉ_NON_CONFIRMÉ.
CREATE OR REPLACE FUNCTION public.declare_courier_return(
  p_order_id   uuid,
  p_courier_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.my_role() IN ('admin', 'agent')) THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  -- Cloisonnement chaîne de garde : le livreur ne déclare QUE SES colis (ceux
  -- dont il a la garde actuelle, orders.courier_id = p_courier_id).
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id AND courier_id = p_courier_id
  ) THEN
    RAISE EXCEPTION 'errors.not_your_order';
  END IF;

  INSERT INTO public.courier_returns (order_id, courier_id, state, declared_by)
  VALUES (p_order_id, p_courier_id, 'declared', p_courier_id)
  ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object('order_id', p_order_id, 'state', 'declared');
END;
$$;

COMMENT ON FUNCTION public.declare_courier_return(uuid, uuid) IS
  'Déclaration de retour par le livreur (Lot D, mig 128, portail /courier cloisonné). État '
  'RETOUR_DÉCLARÉ_NON_CONFIRMÉ (§🔒) : AUCUN changement orders.status, AUCUNE écriture ledger — '
  'la dette du livreur reste INCHANGÉE tant qu''un salarié/admin n''a pas confirmé (DOUBLE '
  'CONFIRMATION, cf. confirm_return_depot/confirm_return_company). Cloisonné : ne déclare que '
  'ses propres colis (orders.courier_id = p_courier_id). REVOKE public/anon/authenticated — '
  'appelée via service_role APRÈS résolution du livreur par code (resolveCourierSession).';

REVOKE ALL ON FUNCTION public.declare_courier_return(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.declare_courier_return(uuid, uuid) TO service_role;

-- 4.3 confirm_return_depot — CAS 1, confirmation salarié dépôt (DOUBLE CONFIRMATION).
CREATE OR REPLACE FUNCTION public.confirm_return_depot(
  p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    -- @security P2-1 : moindre privilège — admin OU capacité dépôt explicite (pas
    -- « agent » générique), OU service_role (chemin server action gardé). La RPC
    -- reste sûre même si son GRANT était un jour élargi.
    public.my_role() = 'admin'
    OR public.has_capability('depot_supervision')
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  -- DOUBLE CONFIRMATION : exige une déclaration préalable par le livreur.
  IF NOT EXISTS (SELECT 1 FROM public.courier_returns WHERE order_id = p_order_id AND state = 'declared') THEN
    RAISE EXCEPTION 'errors.no_return_declared';
  END IF;

  UPDATE public.courier_returns
     SET state = 'confirmed_depot', confirmed_at = now(), confirmed_by = auth.uid()
   WHERE order_id = p_order_id AND state = 'declared';

  INSERT INTO public.scan_events (
    scan_type, order_id, order_type, carrier_tracking_ref, scanned_qty, actor_id
  ) VALUES (
    'return_received', p_order_id, 'affiliate', p_order_id::text, 1, auth.uid()
  )
  ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING;

  -- Réutilise le trigger EXISTANT handle_order_status_reversal (mig 122, EN
  -- PROD, INCHANGÉ) : contre-passe le ledger si la commande était 'delivered'.
  -- ZÉRO écriture ledger ici.
  UPDATE public.orders SET status = 'returned' WHERE id = p_order_id AND status NOT IN ('returned', 'cancelled');

  RETURN jsonb_build_object('order_id', p_order_id, 'state', 'confirmed_depot');
END;
$$;

COMMENT ON FUNCTION public.confirm_return_depot(uuid) IS
  'CAS 1 — confirmation du retour par un salarié/admin dépôt (Lot D, mig 128, DOUBLE '
  'CONFIRMATION §🔒). EXIGE une déclaration préalable (courier_returns.state=''declared'') sinon '
  'RAISE. Passe orders.status=''returned'' → le trigger handle_order_status_reversal (mig 122, '
  'EN PROD, INCHANGÉ) contre-passe le ledger si la commande était ''delivered''. ZÉRO écriture '
  'ledger directe ici (zéro doublon). REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.confirm_return_depot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_return_depot(uuid) TO service_role;

-- 4.4 confirm_return_company — CAS 2, confirmation par la société de transport (admin uniquement).
CREATE OR REPLACE FUNCTION public.confirm_return_company(
  p_order_id    uuid,
  p_company_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courier_returns WHERE order_id = p_order_id AND state = 'declared') THEN
    RAISE EXCEPTION 'errors.no_return_declared';
  END IF;

  UPDATE public.courier_returns
     SET state = 'confirmed_company', company_ref = p_company_ref, confirmed_at = now(), confirmed_by = auth.uid()
   WHERE order_id = p_order_id AND state = 'declared';

  -- Réutilise le trigger EXISTANT (mig 122) : ZÉRO écriture ledger ici.
  UPDATE public.orders SET status = 'returned' WHERE id = p_order_id AND status NOT IN ('returned', 'cancelled');

  RETURN jsonb_build_object('order_id', p_order_id, 'state', 'confirmed_company');
END;
$$;

COMMENT ON FUNCTION public.confirm_return_company(uuid, text) IS
  'CAS 2 — confirmation manuelle du retour par la société de transport, validée par un admin '
  '(Lot D, mig 128, DOUBLE CONFIRMATION §🔒). EXIGE une déclaration préalable. Passe '
  'orders.status=''returned'' → contre-passation via le trigger EXISTANT (mig 122), ZÉRO '
  'écriture ledger directe. REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.confirm_return_company(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_return_company(uuid, text) TO service_role;

-- 4.5 mark_return_lost — CAS 3, perte constatée (admin uniquement) → créance PRODUIT.
CREATE OR REPLACE FUNCTION public.mark_return_lost(
  p_order_id     uuid,
  p_amount_mad   numeric,
  p_quantity     integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.courier_returns%ROWTYPE;
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;

  IF p_amount_mad IS NULL OR p_amount_mad <= 0 THEN
    RAISE EXCEPTION 'errors.invalid_amount';
  END IF;

  -- @finance P1-B : la PERTE PRODUIT est réservée à un colis en garde NON livré.
  -- Une commande 'delivered' compte déjà son cash (cash_owed_mad) ; y ajouter une
  -- créance produit double-compterait la dette. Un colis livré relève du cash
  -- (réconciliation ou confirm_return_* qui contre-passe proprement le ledger).
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND status = 'delivered') THEN
    RAISE EXCEPTION 'errors.delivered_use_reversal';
  END IF;

  SELECT * INTO v_return FROM public.courier_returns WHERE order_id = p_order_id AND state = 'declared';
  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'errors.no_return_declared';
  END IF;

  UPDATE public.courier_returns
     SET state = 'lost', confirmed_at = now(), confirmed_by = auth.uid()
   WHERE id = v_return.id;

  -- Créance PRODUIT ineffaçable (append-only, mig 126) — chiffrée sur le solde
  -- livreur via v_courier_balances.product_debt_mad. AUCUNE nouvelle écriture
  -- ledger globale ici : une dépréciation stock/coût usine côté grand livre est
  -- une QUESTION OUVERTE pour @finance, volontairement non codée (consigne
  -- explicite du prompt — ne pas inventer d'écriture ledger).
  INSERT INTO public.courier_product_debts (courier_id, order_id, quantity, amount_mad, reason, created_by)
  VALUES (v_return.courier_id, p_order_id, p_quantity, p_amount_mad, 'perte', auth.uid());

  RETURN jsonb_build_object('order_id', p_order_id, 'state', 'lost', 'debt_mad', p_amount_mad);
END;
$$;

COMMENT ON FUNCTION public.mark_return_lost(uuid, numeric, integer) IS
  'CAS 3 — perte constatée sur un retour DÉCLARÉ non produit (Lot D, mig 128, admin '
  'uniquement). EXIGE une déclaration préalable. Crée une créance PRODUIT '
  '(courier_product_debts, append-only, mig 126) chiffrée sur v_courier_balances. AUCUNE '
  'nouvelle écriture ledger globale (question ouverte @finance, non codée sur consigne '
  'explicite). p_amount_mad doit être > 0. REVOKE public/anon/authenticated.';

REVOKE ALL ON FUNCTION public.mark_return_lost(uuid, numeric, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_return_lost(uuid, numeric, integer) TO service_role;
