-- =============================================================================
-- Migration 123 — MACHINE À ÉTATS DES COMMISSIONS + ENFORCEMENT RÈGLE N1
-- (idempotent — safe to re-run)  [LOT 2 / B3]
-- =============================================================================
-- But :
--   Graver EN BASE (non contournable) la règle métier N1 :
--     « une commission d'affilié ne devient PAYABLE ('approved') qu'APRÈS que le
--       versement du livreur a été RÉCONCILIÉ (bordereau courier_remittances
--       'reconciled' couvrant la commande). »
--
--   Aujourd'hui (avant 123) : `commissions.status` = pending → approved → paid.
--     - 'pending' posé par le trigger de livraison (009/048/122).
--     - 'approved' posé MANUELLEMENT par un admin (updateCommissionStatus /
--       bulkApproveCommissions) SANS AUCUNE VÉRIFICATION → un admin peut approuver
--       (donc rendre payable via create_payout 049) AVANT d'avoir reçu le cash du
--       livreur = risque de VERSEMENT PRÉMATURÉ (P1 relevé par @finance sur 122).
--     - 'paid' posé atomiquement par create_payout (049), qui ne paie QUE
--       'approved' AND reversed=false. INCHANGÉ ici.
--
--   Ce que 123 ajoute, de façon ADDITIVE et NON destructive :
--     1. GARDE (BEFORE UPDATE, non contournable même par un admin ou service_role
--        passant par l'API) : refuse toute transition VERS 'approved' si la
--        commande n'est pas couverte par un bordereau livreur réconcilié, ou si la
--        commission est contre-passée (reversed).
--     2. AUTO-APPROBATION (AFTER INSERT sur le lien bordereau↔commande) : à la
--        réconciliation d'un versement, les commissions 'pending' des commandes
--        couvertes passent AUTOMATIQUEMENT à 'approved'. La réconciliation EST
--        l'événement qui rend la commission payable → l'admin n'a plus à approuver
--        à la main (et ne PEUT plus contourner N1).
--     3. TERMINALITÉ de 'paid' : une commission soldée ne peut plus changer de
--        statut (sécurité anti-régression comptable ; le flag `reversed` reste
--        orthogonal et autorisé).
--
--   create_payout (049) INCHANGÉ. ledger_entries (048) INCHANGÉ. Aucun double
--   versement introduit : 123 RESTREINT les transitions, il n'en crée aucune de
--   paiement.
--
-- HYPOTHÈSE DE FLUX : la réconciliation du versement suit TOUJOURS la livraison
--   (donc la commission 'pending' existe déjà quand le bordereau est réconcilié).
--   Cas limite (réconciliation avant livraison) : l'auto-approbation ne trouve pas
--   encore la commission → elle restera 'pending' et devra être approuvée
--   manuellement (la GARDE l'autorisera puisque le bordereau réconcilié existe).
-- =============================================================================

-- ── 1. GARDE N1 — transition vers 'approved' conditionnée à la réconciliation ─
-- SECURITY DEFINER : lit courier_remittances/_orders (RLS staff-only) sans être
-- bloquée par la RLS de l'appelant. search_path figé (anti-hijack).
CREATE OR REPLACE FUNCTION public.commissions_enforce_payable_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 'paid' est terminal : le statut ne peut plus bouger (le flag reversed reste
  -- géré à part par handle_order_status_reversal).
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'Commission % déjà soldée (paid) : statut non modifiable', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- N'appliquer la garde N1 que sur la TRANSITION vers 'approved'.
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- Une commission contre-passée n'est jamais payable.
    IF NEW.reversed THEN
      RAISE EXCEPTION 'Commission % contre-passée : non payable', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;

    -- N1 : la commande doit être couverte par un bordereau livreur RÉCONCILIÉ.
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
  END IF;

  -- 'paid' ne peut être ATTEINT QUE depuis 'approved' (donc APRÈS la garde N1)
  -- et jamais pour une commission contre-passée. Ferme le raccourci pending→paid
  -- (un UPDATE direct — ex. updateCommissionStatus — qui court-circuiterait N1,
  -- le filtre reversed ET create_payout : « payé » sans ligne payouts ni ledger).
  -- create_payout (049) fait approved→paid (reversed=false) → AUTORISÉ.
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

DROP TRIGGER IF EXISTS trg_commissions_payable_gate ON public.commissions;
CREATE TRIGGER trg_commissions_payable_gate
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.commissions_enforce_payable_gate();

-- ── 2. AUTO-APPROBATION à la réconciliation du versement livreur ──────────────
-- Déclenché à l'insertion du lien bordereau↔commande (fait par
-- reconcile_courier_remittance, mig 122). Si le bordereau est réconcilié, la
-- commission 'pending' non contre-passée de la commande devient 'approved'.
-- L'UPDATE repasse par la GARDE ci-dessus, qui la valide (le lien réconcilié
-- existe déjà dans la même transaction) → cohérence garantie.
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
        AND reversed = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_auto_approve ON public.courier_remittance_orders;
CREATE TRIGGER trg_commissions_auto_approve
  AFTER INSERT ON public.courier_remittance_orders
  FOR EACH ROW EXECUTE FUNCTION public.commissions_auto_approve_on_remittance();

COMMENT ON FUNCTION public.commissions_enforce_payable_gate() IS
  'GARDE N1 (mig 123) : bloque commissions.status→approved si la commande n''est pas '
  'couverte par un bordereau livreur réconcilié, ou si la commission est reversed. '
  'Rend paid terminal. Non contournable (BEFORE UPDATE, SECURITY DEFINER).';
COMMENT ON FUNCTION public.commissions_auto_approve_on_remittance() IS
  'Auto-approbation (mig 123) : à la réconciliation d''un versement livreur, passe '
  'les commissions pending des commandes couvertes à approved. La réconciliation = '
  'l''événement qui rend la commission payable.';
