-- =============================================================================
-- Migration 065 — Moteur cash livraison wholesale (LOT 4.2 — RPC d'écriture)
-- =============================================================================
-- Contexte : la migration 062 a posé la fondation DB (colonnes + ledger).
--   Ce lot ajoute les RPC SECURITY DEFINER qui sont LE SEUL vecteur d'écriture
--   autorisé dans wholesale_delivery_ledger (le trigger wdl_block_mutations
--   bloque tout UPDATE/DELETE direct).
--
-- Composants de ce lot :
--   1. Assouplissement du CHECK wdl_amount_sign_matches_entry_type
--      (arbitrage Abdou E4-bis : ajustements delta cost_incurred tout signe)
--   2. Index UNIQUE partiel = rempart dur anti-double-collecte (condition @finance C-R2)
--   3. RPC set_wholesale_delivery_config  — écriture config + coût (delta E4-bis)
--   4. CREATE OR REPLACE transition_wholesale_order_status — garde C-NR2 (delivered)
--   5. RPC try_collect_wholesale_delivery_rebill — collecte rebill (idempotente, C-R1)
--
-- RÈGLE ARGENT : tous les montants sont numeric, aucun float, aucun calcul JS.
--   Les invariants financiers sont vérifiés EN SQL dans les corps des RPC.
--   Le CHECK wholesale_delivery_no_mozouna_loss (062) reste le garde-fou inviolable.
--
-- SÉCURITÉ :
--   - Toutes les RPC sont SECURITY DEFINER + SET search_path = public.
--   - La garde de rôle est ré-vérifiée MANUELLEMENT (bypass RLS = on re-vérifie).
--   - Les acheteurs / fournisseurs n'ont AUCUN accès à ces fonctions en pratique
--     (garde admin seul sur les deux RPC d'écriture, cohérent avec la policy 063).
--   - GRANT EXECUTE TO authenticated : Supabase exige que le rôle soit authenticated
--     (pas anon) ; la garde interne (my_role()='admin') bloque tout non-admin.
-- =============================================================================


-- ── 1. Assouplissement du CHECK de signe ─────────────────────────────────────
--
-- Situation d'origine (062) :
--   delivery_cost_incurred    : amount_mad <= 0  (décaissement)
--   delivery_rebill_collected : amount_mad >= 0  (encaissement)
--
-- Problème (arbitrage Abdou E4-bis) :
--   La stratégie DELTA nécessite d'insérer des écritures d'AJUSTEMENT signées.
--   Exemple : coût initial 200 MAD → écriture -200.
--   Révision à la HAUSSE 200→250 MAD → delta +50 → nouvelle écriture -50 (ok).
--   Révision à la BAISSE 250→100 MAD → delta -150 → SUM devient (-250)+(-150)=-400 ✗
--   CORRECTION : delta = -100 - (-250) = +150 → écriture POSITIVE sur cost_incurred.
--   Or le CHECK interdit amount_mad > 0 sur cost_incurred → bloquant.
--
-- Nouveau CHECK :
--   delivery_cost_incurred    : TOUT signe autorisé (ajustements delta positifs ou négatifs)
--   delivery_rebill_collected : amount_mad >= 0 (collecte = encaissement, toujours positif)
--
-- Invariant maintenu : SUM(cost_incurred) = -delivery_cost_mad EN SQL via le RPC.
--   Le RPC garantit la convergence ; la collecte reste toujours >= 0.

DO $$ BEGIN
  -- Supprimer l'ancien CHECK (62) s'il existe encore
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wdl_amount_sign_matches_entry_type'
  ) THEN
    ALTER TABLE public.wholesale_delivery_ledger
      DROP CONSTRAINT wdl_amount_sign_matches_entry_type;
  END IF;

  -- Recréer avec la règle assouplie (idempotent : si déjà absent, on l'ajoute)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wdl_amount_sign_matches_entry_type'
  ) THEN
    ALTER TABLE public.wholesale_delivery_ledger
      ADD CONSTRAINT wdl_amount_sign_matches_entry_type CHECK (
        -- cost_incurred : tout signe autorisé — les écritures de correction delta
        --   peuvent être positives (baisse du coût réel) ou négatives (hausse).
        --   Le RPC garantit : SUM(cost_incurred per order) = -delivery_cost_mad.
        (entry_type = 'delivery_cost_incurred')
        -- rebill_collected : toujours >= 0 (encaissement client, jamais négatif)
        OR (entry_type = 'delivery_rebill_collected' AND amount_mad >= 0)
      );
  END IF;
END $$;

COMMENT ON CONSTRAINT wdl_amount_sign_matches_entry_type ON public.wholesale_delivery_ledger IS
  'Cohérence de signe par type d''écriture. '
  'delivery_cost_incurred : tout signe autorisé — les ajustements DELTA (E4-bis) '
  'peuvent être positifs (baisse du coût) ou négatifs (hausse du coût). '
  'Invariant maintenu par le RPC : SUM(cost_incurred per order) = -delivery_cost_mad. '
  'delivery_rebill_collected : toujours >= 0 (encaissement, jamais un remboursement). '
  'Assouplissement de la contrainte initiale de la migration 062 (arbitrage Abdou E4-bis).';


-- ── 2. Index UNIQUE partiel — rempart anti-double-collecte ────────────────────
--
-- Garantit qu'il ne peut exister QU'UNE SEULE écriture 'delivery_rebill_collected'
-- par commande, indépendamment de l'idempotency_key.
-- Même si deux transactions concurrentes passaient simultanément la garde EXISTS,
-- une seule INSERT réussirait — l'autre recevrait une unique_violation.
-- C'est le rempart DUR contre la double-collecte (condition C-R2 @finance).
--
-- NOTE : cet index s'ajoute à l'idempotency_key UNIQUE (colonne) qui reste le
--   premier niveau de déduplication ; l'index partiel est le deuxième niveau.

CREATE UNIQUE INDEX IF NOT EXISTS uq_wdl_one_rebill_collected_per_order
  ON public.wholesale_delivery_ledger (wholesale_order_id)
  WHERE entry_type = 'delivery_rebill_collected';

COMMENT ON INDEX public.uq_wdl_one_rebill_collected_per_order IS
  'Rempart dur anti-double-collecte (condition C-R2 @finance). '
  'Un seul enregistrement ''delivery_rebill_collected'' par commande — garanti au niveau index. '
  'Même en cas de race condition, une seule INSERT réussit (unique_violation sur l''autre). '
  'Complète l''idempotency_key UNIQUE (premier niveau) par un verrou structurel (deuxième niveau).';


-- ── 3. RPC set_wholesale_delivery_config ─────────────────────────────────────
--
-- Écrit la configuration livraison d'une commande wholesale ET maintient le
-- ledger wholesale_delivery_ledger en convergence via la stratégie DELTA (E4-bis).
--
-- STRATÉGIE DELTA (E4-bis) :
--   Position cible du ledger : SUM(cost_incurred) = -p_cost_mad
--   Déjà en ledger : COALESCE(SUM(amount_mad), 0) WHERE cost_incurred
--   Delta à écrire : v_target - v_already
--   Si delta = 0 → pas d'écriture (idempotence).
--   Si delta ≠ 0 → INSERT avec idempotency_key incluant p_cost_event_uuid.
--
--   Exemples :
--     Config initiale cost=200 → v_already=0, delta=-200, INSERT(-200).
--     Révision 200→250         → v_already=-200, delta=-50,  INSERT(-50).
--     Correction 250→100       → v_already=-250, delta=+150, INSERT(+150) [E4-bis].
--     Handling supplier_billed : p_cost_mad=0, delta=0-0=0 → pas d'écriture.
--
-- GARDE C-R2 intégrée : si la rebill a déjà été collectée ET que le nouveau
--   p_rebill_mad diffère de l'ancien → RAISE (on ne peut pas changer le prix
--   d'un transport déjà facturé au client).
--
-- Le CHECK wholesale_delivery_no_mozouna_loss (062) est le garde-fou final :
--   si l'UPDATE viole l'invariant rebill >= cost (rebilled_client), Postgres lève
--   une erreur qui remonte naturellement à l'appelant.

DROP FUNCTION IF EXISTS public.set_wholesale_delivery_config(uuid, text, text, numeric, numeric, uuid);

CREATE OR REPLACE FUNCTION public.set_wholesale_delivery_config(
  p_order_id         uuid,
  p_logistics_mode   text,
  p_handling         text,
  p_cost_mad         numeric,   -- numeric non contraint : absorbe numeric(10,2) + numeric(12,2)
  p_rebill_mad       numeric,   -- idem
  p_cost_event_uuid  uuid       -- identifiant de l'ÉVÉNEMENT de configuration (idempotence delta)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_rebill   numeric;
  v_old_cost     numeric;
  v_target       numeric;  -- position ledger cible : -p_cost_mad
  v_already      numeric;  -- SUM(cost_incurred) déjà en ledger
  v_delta        numeric;  -- delta à écrire
BEGIN
  -- ── a. Garde de rôle : admin seul ────────────────────────────────────────
  -- Cohérent avec la policy RLS du ledger (063 : admin seul en lecture).
  -- SECURITY DEFINER bypasse RLS → re-vérification manuelle obligatoire.
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── b. Lecture + verrou FOR UPDATE ────────────────────────────────────────
  -- FOR UPDATE sérialise les appels concurrents sur la même commande.
  -- Sans ce verrou, deux appels simultanés calculent le même v_already → double écriture.
  SELECT delivery_rebill_mad, delivery_cost_mad
  INTO v_old_rebill, v_old_cost
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── c. Garde C-R2 : rebill verrouillée après collecte ────────────────────
  -- Si le montant rebill change ET qu'une collecte existe déjà → RAISE.
  -- Raison : l'encaissement est déjà dans le ledger à v_old_rebill ;
  -- changer p_rebill_mad créerait une incohérence comptable (le client a payé X,
  -- on enregistrerait Y). Pour corriger, il faudrait une écriture de correction
  -- sur la rebill, ce qui n'est pas prévu (la collecte est immutable, C-R2).
  IF p_rebill_mad <> v_old_rebill
     AND EXISTS (
       SELECT 1 FROM public.wholesale_delivery_ledger
       WHERE wholesale_order_id = p_order_id
         AND entry_type = 'delivery_rebill_collected'
     )
  THEN
    RAISE EXCEPTION 'errors.rebill_locked_after_collection';
  END IF;

  -- ── d. UPDATE wholesale_orders ────────────────────────────────────────────
  -- COLONNES TOUCHÉES : uniquement les 4 colonnes livraison de 062.
  -- COLONNES INTANGIBLES : supplier_cost_mad, transport_customs_cost_mad,
  --   additional_cost_mad, total_amount, gross_profit_mad, gross_margin_percent.
  --   Le trigger compute_wholesale_order_costs (025) est INTANGIBLE.
  --
  -- Si l'UPDATE viole wholesale_delivery_no_mozouna_loss (062) — e.g.
  --   rebilled_client avec rebill < cost — Postgres lève constraint_violation
  --   qui remonte à l'appelant. C'est le comportement attendu : l'invariant est
  --   visible dans le message d'erreur et corrigeable côté UI.
  UPDATE public.wholesale_orders
  SET
    logistics_mode        = p_logistics_mode,
    delivery_cost_handling = p_handling,
    delivery_cost_mad      = p_cost_mad,
    delivery_rebill_mad    = p_rebill_mad
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.update_failed';
  END IF;

  -- ── e. Écriture coût par DELTA (stratégie E4-bis) ─────────────────────────
  --
  -- Invariant maintenu : SUM(cost_incurred per order) = -p_cost_mad
  --
  -- Cette invariant garantit qu'un admin qui change le coût N fois convergera
  -- TOUJOURS vers le bon solde, sans accumulation d'erreurs :
  --   Config cost=200 : ledger=[−200], SUM=−200 = −200 ✓
  --   Révision cost=250 : ledger=[−200, −50], SUM=−250 = −250 ✓
  --   Correction cost=100 : ledger=[−200, −50, +150], SUM=−100 = −100 ✓
  --   cas supplier_* (cost=0) : delta = 0−0 = 0, pas d'écriture ✓
  --
  -- p_cost_event_uuid est l'identifiant de l'ÉVÉNEMENT de configuration :
  --   même UUID → ON CONFLICT DO NOTHING → idempotence garantie.
  --   UUID différent → écriture delta légitime.
  -- L'appelant (action TS) génère un UUID par appel UI, ce qui est correct.

  v_target  := -p_cost_mad;
  v_already := COALESCE(
    (SELECT SUM(amount_mad)
     FROM public.wholesale_delivery_ledger
     WHERE wholesale_order_id = p_order_id
       AND entry_type = 'delivery_cost_incurred'),
    0
  );
  v_delta := v_target - v_already;

  IF v_delta <> 0 THEN
    INSERT INTO public.wholesale_delivery_ledger
      (wholesale_order_id, entry_type, amount_mad, currency, idempotency_key, created_by)
    VALUES (
      p_order_id,
      'delivery_cost_incurred',
      v_delta,
      'MAD',
      'wdl:' || p_order_id::text || ':delivery_cost_incurred:' || p_cost_event_uuid::text,
      auth.uid()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    -- ON CONFLICT DO NOTHING : si le même p_cost_event_uuid est rejoué (retry UI),
    -- la deuxième tentative est silencieusement ignorée — SUM reste cohérent.
  END IF;
  -- Si v_delta = 0 : SUM déjà à la cible, pas d'écriture inutile.
  -- Cas typique : supplier_billed/supplier_free avec p_cost_mad=0 et aucune écriture passée.

END;
$$;

GRANT EXECUTE ON FUNCTION public.set_wholesale_delivery_config(uuid, text, text, numeric, numeric, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.set_wholesale_delivery_config(uuid, text, text, numeric, numeric, uuid) IS
  'Configure la livraison d''une commande wholesale et maintient le ledger en convergence. '
  'Admin seul (SECURITY DEFINER + garde my_role()). '
  'Garde C-R2 : rebill verrouillée si déjà collectée et montant change. '
  'Stratégie DELTA E4-bis : INSERT v_delta tel que SUM(cost_incurred)=-p_cost_mad, '
  'avec idempotency_key incluant p_cost_event_uuid (retry UI silencieux). '
  'Ne touche AUCUNE colonne financière de marge (trigger compute_wholesale_order_costs intangible). '
  'Le CHECK wholesale_delivery_no_mozouna_loss (062) valide l''invariant rebill >= cost.';


-- ── 4. transition_wholesale_order_status — ajout garde C-NR2 (delivered) ─────
--
-- DIFF STRICTEMENT ADDITIF vs migration 061 :
--   Insertion d'UN seul bloc IF p_new_status = 'delivered' THEN ... END IF;
--   Positionné APRÈS la validation FSM (étape e de 061) et AVANT l'UPDATE (étape h).
--   RIEN D'AUTRE n'est modifié : mêmes arêtes FSM, mêmes timestamps, même history.
--
-- Condition C-NR2 (décision Abdou — BLOQUANT) :
--   Si delivery_cost_handling = 'rebilled_client' ET delivery_cost_mad = 0
--   → le coût transport a été déclaré à la charge du client mais aucun montant
--     n'est renseigné → la commande ne peut pas être clôturée.
--   Raison : clôturer sans coût = Mozouna porte le transport sans compensation.
--   Le bloc ne vérifie PAS delivery_rebill_mad car le CHECK 062 garantit déjà
--   rebill >= cost ; si cost = 0 et rebill > 0, l'invariant est respecté côté
--   guard-fou mais la situation est un oubli de saisie → on bloque par prudence.

DROP FUNCTION IF EXISTS public.transition_wholesale_order_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.transition_wholesale_order_status(
  p_order_id  uuid,
  p_new_status text,
  p_notes     text DEFAULT NULL
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
  r             RECORD;
BEGIN
  -- ── a. Identité et rôle de l'appelant ────────────────────────────────────
  v_caller_uid := auth.uid();

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_uid;

  -- ── b. Garde de rôle (admin OU agent assigné à cette commande) ────────────
  -- On lit agent_id séparément au cas où la commande n'existe pas encore.
  IF v_caller_role = 'admin' THEN
    NULL; -- admin : accès total
  ELSIF v_caller_role = 'agent' THEN
    -- L'agent ne peut agir QUE sur les commandes qui lui sont assignées.
    SELECT agent_id INTO v_agent_id
    FROM public.wholesale_orders
    WHERE id = p_order_id;

    IF v_agent_id IS DISTINCT FROM v_caller_uid THEN
      RAISE EXCEPTION 'errors.forbidden_assign_orders';
    END IF;
  ELSE
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── c. Verrou et lecture du statut courant (FOR UPDATE = sérialisation) ───
  SELECT status, agent_id
  INTO v_prev_status, v_agent_id
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── d. Idempotence ────────────────────────────────────────────────────────
  IF v_prev_status = p_new_status THEN
    RAISE EXCEPTION 'errors.status_already_set';
  END IF;

  -- ── e. FSM stricte — réplique EXACTEMENT wholesale-fsm.ts ────────────────
  --
  -- WHOLESALE_ORDER_FSM = {
  --   pending:            ['assigned', 'confirmed', 'cancelled'],
  --   assigned:           ['supplier_confirmed', 'cancelled'],
  --   supplier_confirmed: ['preparing', 'cancelled'],
  --   preparing:          ['ready', 'cancelled'],
  --   ready:              ['picked_up', 'cancelled'],
  --   picked_up:          ['dispatched', 'cancelled'],
  --   dispatched:         ['delivered', 'cancelled'],
  --   confirmed:          ['sourcing', 'assigned', 'cancelled'],
  --   sourcing:           ['shipped', 'cancelled'],
  --   shipped:            ['delivered', 'cancelled'],
  --   delivered:          [],   -- terminal
  --   cancelled:          [],   -- terminal
  -- }
  --
  -- Toute transition absente de cette table est illégale.

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
    -- delivered et cancelled : états terminaux — aucune transition autorisée
  ) THEN
    RAISE EXCEPTION 'errors.fsm_transition_invalid';
  END IF;

  -- ── [065] Garde C-NR2 : clôture bloquée si coût transport non renseigné ──
  --
  -- BLOC AJOUTÉ PAR 065 — ADDITIF (rien d'autre n'est modifié vs 061).
  --
  -- Condition : transition vers 'delivered' ET handling = 'rebilled_client'
  --   ET delivery_cost_mad = 0 → le coût est à la charge du client mais
  --   aucun montant n'est saisi → clôture interdite (Mozouna porterait le transport).
  --
  -- Note : on relit delivery_cost_handling/delivery_cost_mad depuis la table
  --   (la commande est déjà verrouillée FOR UPDATE depuis l'étape c).
  --   La lecture complémentaire des colonnes livraison ne génère pas un second verrou.
  IF p_new_status = 'delivered' THEN
    IF (SELECT delivery_cost_handling FROM public.wholesale_orders WHERE id = p_order_id) = 'rebilled_client'
       AND (SELECT delivery_cost_mad FROM public.wholesale_orders WHERE id = p_order_id) = 0
    THEN
      RAISE EXCEPTION 'errors.delivery_cost_required';
    END IF;
  END IF;
  -- ── [/065] fin du bloc ajouté ─────────────────────────────────────────────

  -- ── f. Réservation de stock : pending → confirmed uniquement ──────────────
  IF p_new_status = 'confirmed' AND v_prev_status = 'pending' THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      IF NOT public.reserve_stock(r.product_id, r.quantity) THEN
        -- RAISE annule toutes les réservations déjà effectuées (rollback natif).
        RAISE EXCEPTION 'errors.insufficient_stock';
      END IF;
    END LOOP;
  END IF;

  -- ── g. Restauration de stock : → cancelled depuis un état réservé ─────────
  -- États où le stock a été réservé : confirmed, sourcing, shipped (cycle legacy).
  -- Le cycle Deliveroo-style n'utilise pas reserve_stock (pas de pending→confirmed).
  IF p_new_status = 'cancelled'
     AND v_prev_status IN ('confirmed', 'sourcing', 'shipped')
  THEN
    FOR r IN
      SELECT product_id, quantity
      FROM public.wholesale_order_items
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.restore_stock(r.product_id, r.quantity);
    END LOOP;
  END IF;

  -- ── h. UPDATE wholesale_orders ────────────────────────────────────────────
  -- Timestamps conditionnels répliqués depuis l'action TS (~L.771-775).
  -- AUCUNE colonne financière (supplier_cost_mad, transport_customs_cost_mad,
  -- additional_cost_mad, total_amount, gross_profit_mad, gross_margin_percent)
  -- n'est touchée — le trigger compute_wholesale_order_costs (025) est intangible.
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

  -- ── i. INSERT history (append-only) ──────────────────────────────────────
  INSERT INTO public.wholesale_order_status_history
    (order_id, from_status, to_status, changed_by, note)
  VALUES
    (p_order_id, v_prev_status, p_new_status, v_caller_uid, p_notes);

END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_wholesale_order_status(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.transition_wholesale_order_status(uuid, text, text) IS
  'Transition atomique de statut d''une commande grossiste. '
  'Effectue en une seule transaction : garde rôle, verrou FOR UPDATE, '
  'FSM stricte, [065] garde C-NR2 (delivered bloqué si rebilled_client sans coût), '
  'réservation/restauration de stock, UPDATE commande, INSERT history. '
  'Lève des exceptions ''errors.<clé>'' compatibles avec le pattern i18n des actions TS. '
  'Aucune colonne financière modifiée — trigger compute_wholesale_order_costs intangible. '
  '[065] Ajout additif vs 061 : bloc IF p_new_status=delivered entre étapes e et f.';


-- ── 5. RPC try_collect_wholesale_delivery_rebill ──────────────────────────────
--
-- Tente d'enregistrer la collecte du montant rebill livraison d'une commande.
-- RETURNS boolean : true = collecte enregistrée à cet appel ; false = rien fait.
--
-- Cas de RETURN false (pas d'écriture) :
--   - handling <> 'rebilled_client' : fournisseur paie, rien à collecter
--   - delivery_rebill_mad <= 0 : montant non configuré
--   - deposit_received_amount < total_amount + delivery_rebill_mad : solde insuffisant
--   - collecte déjà existante : idempotence
--
-- Race condition (C-R1) :
--   - Le FOR UPDATE verrouille la ligne commande → pas de lecture fantôme.
--   - L'index partiel uq_wdl_one_rebill_collected_per_order + le ON CONFLICT
--     sur unique_violation assurent qu'en cas de double-clic ou race, UNE SEULE
--     collecte atterrit dans le ledger, l'autre retourne false silencieusement.
--
-- Calcul du seuil (C-R1) :
--   Montant dû réel = total_amount + delivery_rebill_mad
--   (rebill livraison s'ajoute au total marchandises, jamais persisté séparément)
--   Ce calcul se fait ENTIÈREMENT EN SQL, jamais côté JS.

DROP FUNCTION IF EXISTS public.try_collect_wholesale_delivery_rebill(uuid);

CREATE OR REPLACE FUNCTION public.try_collect_wholesale_delivery_rebill(
  p_order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    numeric;   -- wholesale_orders.total_amount (numeric 10,2)
  v_deposit  numeric;   -- wholesale_orders.deposit_received_amount (numeric 10,2)
  v_handling text;      -- wholesale_orders.delivery_cost_handling
  v_rebill   numeric;   -- wholesale_orders.delivery_rebill_mad (numeric 12,2)
  v_inserted boolean := false;
BEGIN
  -- ── a. Garde de rôle : admin seul ────────────────────────────────────────
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- ── b. Lecture + verrou FOR UPDATE (C-R1 : sérialisation des appels) ─────
  -- Le verrou empêche deux appels simultanés de lire le même état et d'insérer
  -- deux fois (premier niveau de protection ; l'index partiel est le deuxième).
  SELECT total_amount, deposit_received_amount, delivery_cost_handling, delivery_rebill_mad
  INTO v_total, v_deposit, v_handling, v_rebill
  FROM public.wholesale_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- ── c. Cas où rien à collecter ────────────────────────────────────────────
  -- Handling fournisseur ou rebill non configuré → pas de collecte à enregistrer.
  IF v_handling <> 'rebilled_client' OR v_rebill <= 0 THEN
    RETURN false;
  END IF;

  -- ── d. Seuil de paiement — calcul ENTIÈREMENT EN SQL ─────────────────────
  -- Montant dû réel = total_amount (marchandises) + delivery_rebill_mad (transport)
  -- Si le dépôt reçu ne couvre pas le dû total → collecte prématurée, on attend.
  -- RÈGLE ARGENT : tout en numeric, jamais de float, jamais de JS.
  IF v_deposit < v_total + v_rebill THEN
    RETURN false;
  END IF;

  -- ── e. Court-circuit idempotence : collecte déjà existante ───────────────
  -- Vérification AVANT l'INSERT pour éviter de passer dans le bloc EXCEPTION
  -- (plus lisible, et le FOR UPDATE garantit la cohérence de cette lecture).
  IF EXISTS (
    SELECT 1 FROM public.wholesale_delivery_ledger
    WHERE wholesale_order_id = p_order_id
      AND entry_type = 'delivery_rebill_collected'
  ) THEN
    RETURN false;
  END IF;

  -- ── f. INSERT collecte (avec protection race condition) ───────────────────
  -- L'index partiel uq_wdl_one_rebill_collected_per_order est le rempart dur.
  -- Si deux transactions passent simultanément les gardes ci-dessus (c, d, e),
  -- une seule INSERT réussit ; l'autre reçoit unique_violation → RETURN false.
  --
  -- Idempotency_key : on utilise gen_random_uuid() car une collecte est un
  -- événement ponctuel unique — pas de retry-UUID fourni par l'appelant.
  -- L'index partiel est le vrai rempart anti-doublon (pas la clé d'idempotence ici).
  BEGIN
    INSERT INTO public.wholesale_delivery_ledger
      (wholesale_order_id, entry_type, amount_mad, currency, idempotency_key, created_by)
    VALUES (
      p_order_id,
      'delivery_rebill_collected',
      v_rebill,   -- positif : encaissement client, CHECK wdl_amount_sign_matches_entry_type ok
      'MAD',
      'wdl:' || p_order_id::text || ':delivery_rebill_collected:' || gen_random_uuid()::text,
      auth.uid()
    );
    v_inserted := true;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race condition : une autre transaction a déjà inséré la collecte.
      -- Retour silencieux false (pas d'erreur exposée à l'UI — comportement idempotent).
      RETURN false;
  END;

  RETURN v_inserted;  -- true si INSERT réussi à cet appel

END;
$$;

GRANT EXECUTE ON FUNCTION public.try_collect_wholesale_delivery_rebill(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.try_collect_wholesale_delivery_rebill(uuid) IS
  'Tente d''enregistrer la collecte de la rebill livraison d''une commande wholesale. '
  'Admin seul (SECURITY DEFINER + garde my_role()). '
  'RETURNS boolean : true = collecte inscrite à cet appel, false = rien fait (idempotent). '
  'Gardes : handling=rebilled_client, rebill>0, deposit >= total_amount+rebill (SQL pur). '
  'Race condition (C-R1) : FOR UPDATE + index partiel uq_wdl_one_rebill_collected_per_order '
  '+ EXCEPTION unique_violation → une seule collecte atterrit même en cas de double-clic. '
  'Calcul seuil entièrement en SQL (jamais de float, jamais de JS).';
