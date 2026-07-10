-- =============================================================================
-- Migration 124 — ANTI-FRAUDE : gate fraude sur la PAYABILITÉ des commissions
-- (idempotent — safe to re-run)  [LOT 3 / B7]
-- =============================================================================
-- But :
--   Empêcher qu'une commande FRAUDULEUSE (score de fraude élevé) rende une
--   commission d'affilié payable — même après réconciliation du versement livreur
--   (N1, mig 123). L'anti-fraude était jusqu'ici SCORÉ (orders.fraud_score,
--   order_signals) mais JAMAIS APPLIQUÉ : les scores n'étaient qu'affichés à
--   l'admin. Ici on les BRANCHE sur l'argent.
--
--   Règle B7 (complète N1) :
--     commission payable  ⇔  commande RÉCONCILIÉE (N1)
--                          ET (fraud_score < SEUIL  OU  fraude LEVÉE par un admin).
--
--   SEUIL de retenue = 70/100 (fraud_score). Conservateur : ne retient que le
--   risque FRANC (l'admin peut lever après revue). Valeur métier ajustable
--   (décision Abdou) — centralisée dans la fonction is_order_fraud_held().
--
--   Mécanique, ADDITIVE et non destructive :
--     1. Traçage de la levée sur orders : fraud_cleared_at / fraud_cleared_by.
--     2. Helper is_order_fraud_held(order_id) = risque élevé ET non levé.
--     3. La GARDE N1 (123) est ÉTENDUE : →approved refusé aussi si retenue fraude.
--     4. L'AUTO-APPROBATION (123) est ÉTENDUE : n'approuve PAS les commandes
--        retenues (sinon la garde ferait échouer TOUTE la réconciliation du lot).
--     5. RPC admin clear_order_fraud_hold() : lève la retenue ; si la commande est
--        déjà réconciliée, approuve immédiatement la commission (rattrapage).
--   create_payout (049) INCHANGÉ. Aucun montant modifié.
-- =============================================================================

-- ── 1. Traçage de la levée de retenue fraude ────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fraud_cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS fraud_cleared_by uuid;

COMMENT ON COLUMN public.orders.fraud_cleared_at IS
  'Anti-fraude B7 (124) : horodatage de la levée admin de la retenue fraude. NULL = non levée. Une commande à fraud_score >= seuil et non levée bloque la payabilité de sa commission.';

-- ── 2. Helper : la commande est-elle retenue pour fraude ? ───────────────────
-- SEUIL centralisé ici. STABLE, SECURITY DEFINER (lit orders staff-only depuis
-- les triggers/guards sans dépendre de la RLS de l'appelant).
CREATE OR REPLACE FUNCTION public.is_order_fraud_held(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND COALESCE(o.fraud_score, 0) >= 70      -- SEUIL de retenue (ajustable)
      AND o.fraud_cleared_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_order_fraud_held(uuid) IS
  'Anti-fraude B7 (124) : TRUE si la commande a un fraud_score >= 70 ET n''a pas été levée (fraud_cleared_at NULL). Seuil centralisé et ajustable ici.';

-- ── 3. GARDE N1 étendue — bloque aussi →approved si retenue fraude ───────────
-- (corps 123 conservé À L'IDENTIQUE + AJOUT du bloc B7).
CREATE OR REPLACE FUNCTION public.commissions_enforce_payable_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 'paid' terminal.
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Commission % déjà soldée (paid) : statut non modifiable', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Transition vers 'approved'.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- Contre-passée : jamais payable.
    IF NEW.reversed THEN
      RAISE EXCEPTION 'Commission % contre-passée : non payable', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    -- N1 : commande couverte par un bordereau livreur réconcilié.
    IF NOT EXISTS (
      SELECT 1
      FROM public.courier_remittance_orders cro
      JOIN public.courier_remittances cr ON cr.id = cro.remittance_id
      WHERE cro.order_id = NEW.order_id
        AND cr.status = 'reconciled'
    ) THEN
      RAISE EXCEPTION
        'Règle N1 : commission de la commande % non payable — versement livreur non réconcilié',
        NEW.order_id USING ERRCODE = 'check_violation';
    END IF;

    -- B7 (124) : commande retenue pour fraude (score élevé non levé) → non payable.
    IF public.is_order_fraud_held(NEW.order_id) THEN
      RAISE EXCEPTION
        'Anti-fraude B7 : commande % retenue (risque de fraude non levé) — commission non payable',
        NEW.order_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 'paid' seulement depuis 'approved' non contre-passée (via create_payout).
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    IF OLD.status <> 'approved' OR NEW.reversed THEN
      RAISE EXCEPTION
        'Commission % : passage à ''paid'' autorisé seulement depuis ''approved'' non contre-passée (via create_payout)',
        NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. AUTO-APPROBATION étendue — n'approuve PAS une commande retenue ─────────
-- Sinon la GARDE ferait ÉCHOUER toute la réconciliation d'un lot contenant une
-- commande frauduleuse. On EXCLUT les commandes retenues du WHERE (elles restent
-- 'pending' jusqu'à levée admin via clear_order_fraud_hold).
CREATE OR REPLACE FUNCTION public.commissions_auto_approve_on_remittance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.courier_remittances cr
    WHERE cr.id = NEW.remittance_id AND cr.status = 'reconciled'
  ) THEN
    UPDATE public.commissions
      SET status = 'approved'
      WHERE order_id = NEW.order_id
        AND status = 'pending'
        AND reversed = false
        AND NOT public.is_order_fraud_held(NEW.order_id);   -- B7 : jamais une commande retenue
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. RPC admin : lever la retenue fraude (+ rattrapage d'approbation) ───────
-- Après revue, l'admin lève la retenue. Si la commande est DÉJÀ réconciliée, la
-- commission 'pending' est approuvée immédiatement (repasse la garde : fraude
-- levée + réconcilié → OK). Sinon elle sera auto-approuvée à la réconciliation.
CREATE OR REPLACE FUNCTION public.clear_order_fraud_hold(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Non autorisé : levée de retenue fraude réservée admin/service_role';
  END IF;

  UPDATE public.orders
    SET fraud_cleared_at = now(),
        fraud_cleared_by = auth.uid()
    WHERE id = p_order_id
      AND fraud_cleared_at IS NULL;   -- idempotent : ne re-lève pas

  -- Rattrapage : si déjà réconciliée, approuver maintenant (garde OK).
  UPDATE public.commissions c
    SET status = 'approved'
    WHERE c.order_id = p_order_id
      AND c.status = 'pending'
      AND c.reversed = false
      AND EXISTS (
        SELECT 1 FROM public.courier_remittance_orders cro
        JOIN public.courier_remittances cr ON cr.id = cro.remittance_id
        WHERE cro.order_id = p_order_id AND cr.status = 'reconciled'
      );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_order_fraud_hold(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_fraud_hold(uuid) TO authenticated, service_role;
-- is_order_fraud_held : helper interne (guards/RPC). Pas d'accès direct utilisateur.
REVOKE ALL ON FUNCTION public.is_order_fraud_held(uuid) FROM public, anon, authenticated;
